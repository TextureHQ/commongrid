/**
 * generate-changelog.ts
 *
 * Diffs the current data JSON files against a stored snapshot and writes
 * data/changelog.json — a structured feed of recently-updated and newly-added
 * entities for the landing page.
 *
 * Run after any sync script to pick up changes:
 *   yarn generate:changelog
 *
 * On first run: snapshot is empty, so all existing entities are treated as
 * "newly added" up to MAX_NEW_ENTRIES. Subsequent runs diff against the last
 * snapshot and emit only real changes.
 *
 * Outputs:
 *   data/changelog.json — { updatedAt, recentlyUpdated[], newlyAdded[] }
 *   data/.snapshot/     — Previous state for diffing next run
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "./lib";

// ── Config ────────────────────────────────────────────────────────────────────

const SNAPSHOT_DIR = path.join(DATA_DIR, ".snapshot");
const CHANGELOG_PATH = path.join(DATA_DIR, "changelog.json");
const MAX_ENTRIES = 10; // entries per bucket

// ── Types ─────────────────────────────────────────────────────────────────────

type EntityKind = "utility" | "iso" | "rto" | "balancing-authority";

interface EntityRecord {
  id: string;
  slug: string;
  name: string;
  shortName?: string | null;
  segment?: string | null;
  eiaCode?: string | null;
  [key: string]: unknown;
}

interface ChangelogEntry {
  kind: "updated" | "added";
  entityType: EntityKind;
  entityTypeLabel: string;
  name: string;
  slug: string;
  detail: string;
  isoTimestamp: string;
}

export interface Changelog {
  updatedAt: string;
  recentlyUpdated: ChangelogEntry[];
  newlyAdded: ChangelogEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readDataJSON<T>(filename: string): T {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return [] as unknown as T;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

function readSnapshotJSON<T>(filename: string): T {
  const p = path.join(SNAPSHOT_DIR, filename);
  if (!fs.existsSync(p)) return [] as unknown as T;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

function writeSnapshotJSON(filename: string, data: unknown): void {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), JSON.stringify(data, null, 2));
}

/** Return a stable JSON string for a record (for equality comparison) */
function stableStringify(obj: EntityRecord): string {
  const sorted = Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sorted);
}

/** Map entity segment/type to a human-readable label */
function entityTypeLabel(kind: EntityKind, record: EntityRecord): string {
  if (kind === "utility") {
    const seg = record.segment as string | null;
    if (!seg) return "Utility";
    const labels: Record<string, string> = {
      INVESTOR_OWNED_UTILITY: "IOU",
      DISTRIBUTION_COOPERATIVE: "Co-op",
      GENERATION_AND_TRANSMISSION: "G&T Co-op",
      MUNICIPAL_UTILITY: "Municipal Utility",
      POLITICAL_SUBDIVISION: "Political Subdivision",
      FEDERAL_POWER_AGENCY: "Federal Power Agency",
      COMMUNITY_CHOICE_AGGREGATOR: "CCA",
    };
    return labels[seg] ?? "Utility";
  }
  if (kind === "iso") return "ISO";
  if (kind === "rto") return "RTO";
  if (kind === "balancing-authority") return "Grid Op";
  return "Entity";
}

/** Generate a human-readable update detail line from field diffs */
function describeUpdate(
  kind: EntityKind,
  record: EntityRecord,
  prev: EntityRecord,
): string {
  const changed: string[] = [];

  // Check specific meaningful fields and emit friendly descriptions
  const fieldLabels: Record<string, string> = {
    name: "Name updated",
    segment: "Segment updated",
    status: "Status updated",
    customerCount: "Customer count updated",
    peakDemandMw: "Peak demand figure updated (EIA 861)",
    winterPeakDemandMw: "Winter peak demand updated (EIA 861)",
    totalRevenueDollars: "Revenue data updated",
    totalSalesMwh: "Sales data updated (EIA 861)",
    nercRegion: "NERC region updated",
    hasGeneration: "Generation flag updated",
    hasTransmission: "Transmission flag updated",
    hasDistribution: "Distribution flag updated",
    amiMeterCount: "AMI meter count updated",
    totalMeterCount: "Total meter count updated",
    isoId: "ISO assignment updated",
    rtoId: "RTO assignment updated",
    balancingAuthorityId: "Balancing authority updated",
    serviceTerritoryId: "Service territory geometry updated",
    jurisdiction: "Jurisdiction updated",
    website: "Website updated",
    logo: "Logo updated",
    states: "Operating states updated",
    shortName: "Short name updated",
    eiaId: "EIA ID added",
    eiaCode: "EIA code added",
    regionId: "Region assigned",
    // ISO/RTO specific
    memberUtilities: "Member utility list refreshed",
  };

  for (const [field, label] of Object.entries(fieldLabels)) {
    const cur = JSON.stringify(record[field]);
    const old = JSON.stringify(prev[field]);
    if (cur !== old) {
      changed.push(label);
    }
  }

  const typeLabel = entityTypeLabel(kind, record);

  if (changed.length === 0) return `Profile updated · ${typeLabel}`;
  if (changed.length === 1) return `${changed[0]} · ${typeLabel}`;
  if (changed.length === 2) return `${changed[0]}, ${changed[1]} · ${typeLabel}`;
  return `${changed[0]} + ${changed.length - 1} more fields · ${typeLabel}`;
}

/** Generate a "newly added" detail line */
function describeAdded(kind: EntityKind, record: EntityRecord): string {
  const typeLabel = entityTypeLabel(kind, record);
  const jurisdiction = record.jurisdiction as string | null;
  const states = record.states as string[] | null;

  if (kind === "utility") {
    const seg = record.segment as string | null;
    if (seg === "DISTRIBUTION_COOPERATIVE") {
      const state = jurisdiction?.split(",")[0]?.trim() ?? states?.[0] ?? "";
      return state
        ? `${state} distribution co-op added · ${typeLabel}`
        : `Distribution co-op added · ${typeLabel}`;
    }
    if (seg === "GENERATION_AND_TRANSMISSION") {
      return `G&T co-op added · ${typeLabel}`;
    }
    if (seg === "INVESTOR_OWNED_UTILITY") {
      const state = jurisdiction?.split(",")[0]?.trim() ?? states?.[0] ?? "";
      return state ? `${state} IOU — full profile added · ${typeLabel}` : `IOU added · ${typeLabel}`;
    }
    if (seg === "MUNICIPAL_UTILITY") {
      const state = jurisdiction?.split(",")[0]?.trim() ?? states?.[0] ?? "";
      return state ? `${state} municipal utility added · ${typeLabel}` : `Municipal utility added · ${typeLabel}`;
    }
    return `Entity added · ${typeLabel}`;
  }
  if (kind === "iso") return `ISO added · ${typeLabel}`;
  if (kind === "rto") return `RTO added · ${typeLabel}`;
  if (kind === "balancing-authority") return `Balancing authority added · ${typeLabel}`;
  return `Added · ${typeLabel}`;
}

// ── Diff ──────────────────────────────────────────────────────────────────────

interface DiffResult {
  updated: Array<{ record: EntityRecord; prev: EntityRecord }>;
  added: EntityRecord[];
}

function diffEntities(
  current: EntityRecord[],
  snapshot: EntityRecord[],
): DiffResult {
  const snapshotMap = new Map(snapshot.map((e) => [e.id, e]));
  const updated: DiffResult["updated"] = [];
  const added: EntityRecord[] = [];

  for (const record of current) {
    const prev = snapshotMap.get(record.id);
    if (!prev) {
      added.push(record);
    } else if (stableStringify(record) !== stableStringify(prev)) {
      updated.push({ record, prev });
    }
  }

  return { updated, added };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DATASETS: Array<{ file: string; kind: EntityKind }> = [
  { file: "utilities.json", kind: "utility" },
  { file: "isos.json", kind: "iso" },
  { file: "rtos.json", kind: "rto" },
  { file: "balancing-authorities.json", kind: "balancing-authority" },
];

function main() {
  const now = new Date().toISOString();
  const allUpdated: ChangelogEntry[] = [];
  const allAdded: ChangelogEntry[] = [];

  let totalUpdated = 0;
  let totalAdded = 0;

  for (const { file, kind } of DATASETS) {
    const current = readDataJSON<EntityRecord[]>(file);
    const snapshot = readSnapshotJSON<EntityRecord[]>(file);

    const { updated, added } = diffEntities(current, snapshot);

    totalUpdated += updated.length;
    totalAdded += added.length;

    console.log(`  ${file}: ${updated.length} updated, ${added.length} added`);

    for (const { record, prev } of updated) {
      allUpdated.push({
        kind: "updated",
        entityType: kind,
        entityTypeLabel: entityTypeLabel(kind, record),
        name: record.name,
        slug: record.slug,
        detail: describeUpdate(kind, record, prev),
        isoTimestamp: now,
      });
    }

    for (const record of added) {
      allAdded.push({
        kind: "added",
        entityType: kind,
        entityTypeLabel: entityTypeLabel(kind, record),
        name: record.name,
        slug: record.slug,
        detail: describeAdded(kind, record),
        isoTimestamp: now,
      });
    }
  }

  // Load existing changelog to merge with previous runs
  const existingChangelog: Changelog = fs.existsSync(CHANGELOG_PATH)
    ? (JSON.parse(fs.readFileSync(CHANGELOG_PATH, "utf-8")) as Changelog)
    : { updatedAt: now, recentlyUpdated: [], newlyAdded: [] };

  // Prepend new entries, deduplicate by slug+kind, cap at MAX_ENTRIES
  const mergeEntries = (
    newEntries: ChangelogEntry[],
    existing: ChangelogEntry[],
  ): ChangelogEntry[] => {
    const seen = new Set<string>();
    const merged: ChangelogEntry[] = [];
    for (const entry of [...newEntries, ...existing]) {
      const key = `${entry.kind}:${entry.entityType}:${entry.slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(entry);
      }
    }
    return merged.slice(0, MAX_ENTRIES);
  };

  const changelog: Changelog = {
    updatedAt: now,
    recentlyUpdated: mergeEntries(allUpdated, existingChangelog.recentlyUpdated),
    newlyAdded: mergeEntries(allAdded, existingChangelog.newlyAdded),
  };

  // Write changelog
  fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2));
  console.log(`\n  Wrote ${CHANGELOG_PATH}`);
  console.log(`  recentlyUpdated: ${changelog.recentlyUpdated.length} entries`);
  console.log(`  newlyAdded: ${changelog.newlyAdded.length} entries`);

  // Update snapshots
  for (const { file } of DATASETS) {
    const current = readDataJSON<EntityRecord[]>(file);
    writeSnapshotJSON(file, current);
  }
  console.log(`  Updated snapshots in ${SNAPSHOT_DIR}`);

  if (totalUpdated === 0 && totalAdded === 0) {
    console.log("\n  No changes detected — changelog unchanged (existing entries preserved).");
  } else {
    console.log(`\n  Total: ${totalUpdated} entity updates, ${totalAdded} new entities across all datasets.`);
  }
}

console.log("Generating changelog from data diffs...\n");
main();
