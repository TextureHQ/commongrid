/**
 * Curated IOU demand-response programs → SyncRecord mapping (CG-289).
 *
 * The distribution-co-op programs already in the Programs model were curated
 * (pulled from a source of record, modeled into the Program schema). There is
 * NO federal open feed of *named* DR programs: EIA-861 is utility-level
 * aggregate statistics, not a program catalog, and DSIRE's structured API is
 * access-gated + licensed (can't redistribute in an open dataset). So the IOU
 * programs are captured the same way the co-ops were — from the utilities' own
 * public program pages — normalized into a `ScrapedProgram`, and modeled here
 * into the existing `programs` entity, linked to the parent utility.
 *
 * This module is the pure, I/O-free mapping half (like power-plants-860m.ts):
 *   ScrapedProgram[] + utility resolver  →  SyncRecord[] (entityType "program")
 * so the mapping is unit-testable without a network fetch or a database. The
 * scraper (I/O) lives in scripts/; it produces ScrapedProgram[] and hands them
 * here, then to applySync.
 *
 * Linkage: a program links to its administering utility through
 * `organizations: [{ entityId, role }]`, where `entityId` is the utility SLUG
 * (verified against data/programs.json — co-op links use slugs like
 * "duke-energy", not the UUID id). The resolver returns a utility *id*, so this
 * mapper translates id → slug via the same utility list the resolver indexed.
 */

import type { EntityType } from "@/lib/mod/apply-contribution";
import type {
  AssetType,
  CompensationTier,
  DeviceType,
  GridService,
  IncentiveStructure,
  MarketSegment,
  ParticipationModel,
  ProgramSeason,
  ProgramStatus,
} from "@/types/programs";
import type { SyncRecord } from "./apply-sync";
import {
  buildUtilityLookups,
  type ResolveInput,
  type ResolverUtility,
  resolveUtilityId,
} from "./resolve-entity";

export const PROGRAM_ENTITY_TYPE: EntityType = "program";
export const IOU_DR_SYNC_ACTOR = "sync:iou-dr-programs";

/**
 * Fields this curated sync asserts. Everything else on a program (moderator
 * notes, hand-tuned compensation detail, etc.) is left to humans and, via
 * conflict policy (B) in applySync, is never clobbered by a re-run.
 *
 * Kept as an exported allowlist so the sync's ownership surface is explicit and
 * reviewable — the same discipline as EIA_860M_OWNED_FIELDS.
 */
export const IOU_DR_OWNED_FIELDS = [
  "name",
  "description",
  "organizations",
  "assetTypes",
  "deviceTypes",
  "marketSegments",
  "participationModels",
  "incentiveStructures",
  "gridServices",
  "compensationTiers",
  "programSeason",
  "status",
  "programWebsite",
  "faqUrl",
  "termsUrl",
  "contactUrl",
  "dermsVendor",
] as const;

/**
 * The normalized shape a scraper must produce for one program. This is the
 * contract between the (messy, per-utility) extraction layer and the (strict,
 * schema-shaped) mapping layer. Enum-typed fields are already validated to the
 * Program vocabulary by the time they reach this mapper.
 */
export interface ScrapedProgram {
  /** Program name as published by the utility, e.g. "Renewable Battery Connect". */
  name: string;
  /** The administering utility, by the strongest identifier the scraper found. */
  utility: {
    eiaId?: string | number | null;
    baCode?: string | null;
    state?: string | null;
    name?: string | null;
  };
  description?: string;
  assetTypes?: AssetType[];
  deviceTypes?: DeviceType[];
  marketSegments?: MarketSegment[];
  participationModels?: ParticipationModel[];
  incentiveStructures?: IncentiveStructure[];
  gridServices?: GridService[];
  compensationTiers?: CompensationTier[];
  programSeason?: ProgramSeason;
  status?: ProgramStatus;
  programWebsite?: string;
  faqUrl?: string;
  termsUrl?: string;
  contactUrl?: string;
  dermsVendor?: string;
}

export interface MapResult {
  records: SyncRecord[];
  /** Programs whose utility could not be resolved — never emitted, reported. */
  unresolved: Array<{ name: string; utility: ScrapedProgram["utility"] }>;
  methodCounts: Record<string, number>;
}

/**
 * Deterministic slug for a program: `<utility-slug>-<program-name-slug>`.
 * Stable across re-runs (same utility + same name → same slug → same id), so a
 * re-run updates in place instead of creating duplicates. Mirrors the co-op
 * slugs (e.g. "drivev-smart-charging-rewards").
 */
export function programSlug(utilitySlug: string, programName: string): string {
  const namePart = slugify(programName);
  // Avoid "duke-energy-duke-energy-..." if the name already leads with the
  // utility; keep it readable but still unique.
  return `${utilitySlug}-${namePart}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Map curated/scraped IOU programs to Program SyncRecords, resolving each to
 * its parent utility. Pure: pass in the utility list once (from
 * data/utilities.json or a DB read) and it builds the resolver indexes + an
 * id→slug map internally.
 */
export function toProgramSyncRecords(
  scraped: ReadonlyArray<ScrapedProgram>,
  utilities: ReadonlyArray<ResolverUtility & { slug: string }>,
): MapResult {
  const lookups = buildUtilityLookups(utilities);
  const idToSlug = new Map<string, string>();
  for (const u of utilities) idToSlug.set(u.id, u.slug);

  const records: SyncRecord[] = [];
  const unresolved: MapResult["unresolved"] = [];
  const methodCounts: Record<string, number> = {};

  for (const p of scraped) {
    const input: ResolveInput = {
      eiaId: p.utility.eiaId ?? null,
      baCode: p.utility.baCode ?? null,
      state: p.utility.state ?? null,
      name: p.utility.name ?? null,
    };
    const { utilityId, method } = resolveUtilityId(input, lookups);
    methodCounts[method] = (methodCounts[method] ?? 0) + 1;

    if (!utilityId) {
      unresolved.push({ name: p.name, utility: p.utility });
      continue;
    }
    const utilitySlug = idToSlug.get(utilityId);
    if (!utilitySlug) {
      // Resolver returned an id we can't map back to a slug — treat as
      // unresolved rather than emit a broken organizations link.
      unresolved.push({ name: p.name, utility: p.utility });
      methodCounts[method] -= 1;
      methodCounts.unresolved = (methodCounts.unresolved ?? 0) + 1;
      continue;
    }

    const slug = programSlug(utilitySlug, p.name);
    records.push({
      entityId: `prog-${slug}`,
      slug,
      fields: pruneUndefined({
        name: p.name,
        description: p.description,
        organizations: [{ entityId: utilitySlug, role: "ADMINISTRATOR" }],
        assetTypes: p.assetTypes ?? [],
        deviceTypes: p.deviceTypes ?? [],
        marketSegments: p.marketSegments ?? [],
        participationModels: p.participationModels ?? [],
        incentiveStructures: p.incentiveStructures ?? [],
        // Every program in this feed is, by definition, a demand-response
        // program; guarantee DEMAND_RESPONSE is present without duplicating it.
        gridServices: withDemandResponse(p.gridServices),
        compensationTiers: p.compensationTiers ?? [],
        programSeason: p.programSeason,
        status: p.status ?? ("ACTIVE" as ProgramStatus),
        programWebsite: p.programWebsite,
        faqUrl: p.faqUrl,
        termsUrl: p.termsUrl,
        contactUrl: p.contactUrl,
        dermsVendor: p.dermsVendor,
      }),
    });
  }

  return { records, unresolved, methodCounts };
}

function withDemandResponse(services: GridService[] | undefined): GridService[] {
  const set = new Set<GridService>(services ?? []);
  set.add("DEMAND_RESPONSE" as GridService);
  return [...set];
}

/** Drop undefined values so applySync only asserts fields the scraper found. */
function pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
