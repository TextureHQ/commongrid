/**
 * EIA-860M → SyncRecord mapping for the monthly power-plants sync.
 *
 * EIA-860M is the monthly supplement to the annual EIA-860. It is authoritative
 * for *generator-level* facts that move between annual releases — a unit
 * flipping Planned → Operable, capacity and generator-count changes, fuel/tech
 * updates, proposed online dates. It is NOT authoritative for stable plant
 * metadata (name, coordinates, county, sector); the existing merge deliberately
 * preserves those from the annual filing.
 *
 * So the sync only asserts the fields 860M actually owns. Everything else is
 * left to the annual sync and to human contributions — which, combined with
 * conflict policy (B), means a monthly run can never clobber a curated name or a
 * hand-fixed location.
 *
 * This module is pure (no I/O) so the mapping is unit-testable without a
 * database or a network fetch.
 */

import type { EntityType } from "@/lib/mod/apply-contribution";
import type { SyncRecord } from "./apply-sync";

export const POWER_PLANT_ENTITY_TYPE: EntityType = "power_plant";

/**
 * Fields EIA-860M is authoritative for. Only these are written by the monthly
 * sync; the plant's identity/location come from the annual filing and stay put.
 */
export const EIA_860M_OWNED_FIELDS = [
  "status",
  "totalCapacityMw",
  "generatorCount",
  "primaryFuel",
  "fuelCategory",
  "technologies",
  "energySources",
  "operatingYear",
  "proposedCapacityMw",
  "proposedOnlineYear",
] as const;

/** The subset of a merged power-plant record this mapping reads. */
export interface MonthlyPlantRecord {
  id: string;
  slug: string;
  name: string;
  plantCode: string;
  utilityName: string;
  state: string;
  latitude: number;
  longitude: number;
  sector: string;
  status: "operable" | "proposed";
  totalCapacityMw: number;
  generatorCount: number;
  primaryFuel: string | null;
  fuelCategory: string;
  technologies: string[];
  energySources: string[];
  operatingYear: number | null;
  proposedCapacityMw: number | null;
  proposedOnlineYear: number | null;
  // Present on records seeded by 860M for brand-new plants; needed on create.
  county?: string | null;
  utilityId?: string | null;
  balancingAuthorityId?: string | null;
  baCode?: string | null;
  nercRegion?: string | null;
  gridVoltageKv?: number | null;
}

/**
 * Map merged power-plant records to sync records.
 *
 * `existingIds` is the set of power_plant ids already in the DB. A record whose
 * id is absent is a *new* plant (860M seeds these), and a create must supply the
 * NOT NULL columns the schema requires — so new plants carry the full field set,
 * while updates to existing plants carry only the 860M-owned fields. This keeps
 * updates surgical (policy (B) sees a minimal change set) without violating
 * insert constraints on creates.
 */
export function toSyncRecords(
  records: MonthlyPlantRecord[],
  existingIds: ReadonlySet<string>,
  asOf: Date | null
): SyncRecord[] {
  return records.map((r) => {
    const isNew = !existingIds.has(r.id);
    return { ...(isNew ? toCreateRecord(r) : toUpdateRecord(r)), sourceId: "eia-860m", asOf };
  });
}

function toUpdateRecord(r: MonthlyPlantRecord): Omit<SyncRecord, "sourceId" | "asOf"> {
  const fields: Record<string, unknown> = {};
  for (const field of EIA_860M_OWNED_FIELDS) {
    fields[field] = r[field as keyof MonthlyPlantRecord];
  }
  return { entityId: r.id, slug: r.slug, fields };
}

function toCreateRecord(r: MonthlyPlantRecord): Omit<SyncRecord, "sourceId" | "asOf"> {
  // A create must satisfy every NOT NULL column on power_plants.
  const fields: Record<string, unknown> = {
    name: r.name,
    plantCode: r.plantCode,
    utilityId: r.utilityId ?? null,
    utilityName: r.utilityName,
    balancingAuthorityId: r.balancingAuthorityId ?? null,
    baCode: r.baCode ?? null,
    state: r.state,
    county: r.county ?? null,
    latitude: r.latitude,
    longitude: r.longitude,
    nercRegion: r.nercRegion ?? null,
    sector: r.sector,
    primaryFuel: r.primaryFuel,
    fuelCategory: r.fuelCategory,
    technologies: r.technologies,
    energySources: r.energySources,
    totalCapacityMw: r.totalCapacityMw,
    generatorCount: r.generatorCount,
    operatingYear: r.operatingYear,
    gridVoltageKv: r.gridVoltageKv ?? null,
    status: r.status,
    proposedCapacityMw: r.proposedCapacityMw,
    proposedOnlineYear: r.proposedOnlineYear,
    source: "EIA-860M",
    sourceUrl: "https://www.eia.gov/electricity/data/eia860m/",
  };
  return { entityId: r.id, slug: r.slug, fields };
}
