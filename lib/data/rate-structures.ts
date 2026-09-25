/**
 * Data loading abstraction for rate structures.
 *
 * Reads from Postgres via Drizzle.
 */

import type { RateStructure } from "@/types/rate-structures";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface RateStructureFilters {
  /** Min 2 chars. Matches against name, utilityName, and slug (case-insensitive). */
  search?: string;
  sector?: string;
  hasTou?: boolean;
  hasDemandCharge?: boolean;
  hasNetMetering?: boolean;
  isEvRate?: boolean;
  /** Exact match on the resolved utility id (FK to utilities.id). */
  utilityId?: string;
  /** Exact match on the EIA utility id. */
  eiaId?: number;
}

// ---------------------------------------------------------------------------
// Data normalization
// ---------------------------------------------------------------------------

function dateToString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function nullableString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

export function dbRowToRateStructure(row: Record<string, unknown>): RateStructure {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    eiaId: row.eiaId === null || row.eiaId === undefined ? undefined : Number(row.eiaId),
    utilityId: nullableString(row.utilityId),
    regionId: nullableString(row.regionId),
    utilityName: nullableString(row.utilityName),
    sector: nullableString(row.sector),
    serviceType: nullableString(row.serviceType),
    description: nullableString(row.description),
    fixedCharge: nullableString(row.fixedCharge),
    fixedChargeUnits: nullableString(row.fixedChargeUnits),
    energyRateStructure: row.energyRateStructure,
    energyWeekdaySchedule: row.energyWeekdaySchedule,
    energyWeekendSchedule: row.energyWeekendSchedule,
    demandRateStructure: row.demandRateStructure,
    flatDemandStructure: row.flatDemandStructure,
    demandRateUnit: nullableString(row.demandRateUnit),
    netMeteringRules: row.netMeteringRules,
    hasTou: Boolean(row.hasTou),
    hasDemandCharge: Boolean(row.hasDemandCharge),
    hasNetMetering: Boolean(row.hasNetMetering),
    isEvRate: Boolean(row.isEvRate),
    startDate: dateToString(row.startDate),
    endDate: dateToString(row.endDate),
    approved: Boolean(row.approved),
    isDefault: Boolean(row.isDefault),
    source: nullableString(row.source),
    sourceUrl: nullableString(row.sourceUrl),
    sourceParentUrl: nullableString(row.sourceParentUrl),
    sourceDate: dateToString(row.sourceDate),
    createdAt: dateToString(row.createdAt) ?? "",
    updatedAt: dateToString(row.updatedAt) ?? "",
    version: row.version === null || row.version === undefined ? 1 : Number(row.version),
  };
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

async function loadFromDb(filters?: RateStructureFilters): Promise<RateStructure[]> {
  const { getDb } = await import("@/lib/db/client");
  const { rateStructures } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: (DrizzleSQL | undefined)[] = [];

  // Exclude soft-deleted entities
  conditions.push(isNull(rateStructures.deletedAt));

  if (filters?.search) {
    conditions.push(
      or(
        ilike(rateStructures.name, `%${filters.search}%`),
        ilike(rateStructures.utilityName, `%${filters.search}%`),
        ilike(rateStructures.slug, `%${filters.search}%`)
      )
    );
  }

  if (filters?.sector) conditions.push(eq(rateStructures.sector, filters.sector));

  if (typeof filters?.hasTou === "boolean") {
    conditions.push(eq(rateStructures.hasTou, filters.hasTou));
  }
  if (typeof filters?.hasDemandCharge === "boolean") {
    conditions.push(eq(rateStructures.hasDemandCharge, filters.hasDemandCharge));
  }
  if (typeof filters?.hasNetMetering === "boolean") {
    conditions.push(eq(rateStructures.hasNetMetering, filters.hasNetMetering));
  }
  if (typeof filters?.isEvRate === "boolean") {
    conditions.push(eq(rateStructures.isEvRate, filters.isEvRate));
  }

  if (filters?.utilityId) conditions.push(eq(rateStructures.utilityId, filters.utilityId));
  if (filters?.eiaId !== undefined) conditions.push(eq(rateStructures.eiaId, filters.eiaId));

  const rows = await db
    .select({
      id: rateStructures.id,
      slug: rateStructures.slug,
      name: rateStructures.name,
      eiaId: rateStructures.eiaId,
      utilityId: rateStructures.utilityId,
      regionId: rateStructures.regionId,
      utilityName: rateStructures.utilityName,
      sector: rateStructures.sector,
      serviceType: rateStructures.serviceType,
      description: rateStructures.description,
      fixedCharge: rateStructures.fixedCharge,
      fixedChargeUnits: rateStructures.fixedChargeUnits,
      energyRateStructure: rateStructures.energyRateStructure,
      energyWeekdaySchedule: rateStructures.energyWeekdaySchedule,
      energyWeekendSchedule: rateStructures.energyWeekendSchedule,
      demandRateStructure: rateStructures.demandRateStructure,
      flatDemandStructure: rateStructures.flatDemandStructure,
      demandRateUnit: rateStructures.demandRateUnit,
      netMeteringRules: rateStructures.netMeteringRules,
      hasTou: rateStructures.hasTou,
      hasDemandCharge: rateStructures.hasDemandCharge,
      hasNetMetering: rateStructures.hasNetMetering,
      isEvRate: rateStructures.isEvRate,
      startDate: rateStructures.startDate,
      endDate: rateStructures.endDate,
      approved: rateStructures.approved,
      isDefault: rateStructures.isDefault,
      source: rateStructures.source,
      sourceUrl: rateStructures.sourceUrl,
      sourceParentUrl: rateStructures.sourceParentUrl,
      sourceDate: rateStructures.sourceDate,
      createdAt: rateStructures.createdAt,
      updatedAt: rateStructures.updatedAt,
      version: rateStructures.version,
    })
    .from(rateStructures)
    .where(and(...conditions.filter((c): c is DrizzleSQL => c !== undefined)));

  return rows.map((r) => dbRowToRateStructure(r as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a single rate structure by slug. Returns null when the slug is not
 * found or the row has been soft-deleted.
 */
export async function loadRateBySlug(slug: string): Promise<RateStructure | null> {
  const { getDb } = await import("@/lib/db/client");
  const { rateStructures } = await import("@/lib/db/schema");
  const { eq, and, isNull } = await import("drizzle-orm");

  const db = getDb();
  const [row] = await db
    .select({
      id: rateStructures.id,
      slug: rateStructures.slug,
      name: rateStructures.name,
      eiaId: rateStructures.eiaId,
      utilityId: rateStructures.utilityId,
      regionId: rateStructures.regionId,
      utilityName: rateStructures.utilityName,
      sector: rateStructures.sector,
      serviceType: rateStructures.serviceType,
      description: rateStructures.description,
      fixedCharge: rateStructures.fixedCharge,
      fixedChargeUnits: rateStructures.fixedChargeUnits,
      energyRateStructure: rateStructures.energyRateStructure,
      energyWeekdaySchedule: rateStructures.energyWeekdaySchedule,
      energyWeekendSchedule: rateStructures.energyWeekendSchedule,
      demandRateStructure: rateStructures.demandRateStructure,
      flatDemandStructure: rateStructures.flatDemandStructure,
      demandRateUnit: rateStructures.demandRateUnit,
      netMeteringRules: rateStructures.netMeteringRules,
      hasTou: rateStructures.hasTou,
      hasDemandCharge: rateStructures.hasDemandCharge,
      hasNetMetering: rateStructures.hasNetMetering,
      isEvRate: rateStructures.isEvRate,
      startDate: rateStructures.startDate,
      endDate: rateStructures.endDate,
      approved: rateStructures.approved,
      isDefault: rateStructures.isDefault,
      source: rateStructures.source,
      sourceUrl: rateStructures.sourceUrl,
      sourceParentUrl: rateStructures.sourceParentUrl,
      sourceDate: rateStructures.sourceDate,
      createdAt: rateStructures.createdAt,
      updatedAt: rateStructures.updatedAt,
      version: rateStructures.version,
    })
    .from(rateStructures)
    .where(and(eq(rateStructures.slug, slug), isNull(rateStructures.deletedAt)));

  if (!row) return null;
  return dbRowToRateStructure(row as Record<string, unknown>);
}

/**
 * Load rate structures, optionally filtered.
 */
export async function loadRateStructures(filters?: RateStructureFilters): Promise<RateStructure[]> {
  return loadFromDb(filters);
}
