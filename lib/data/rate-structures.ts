/**
 * Data loading abstraction for rate structures.
 *
 * Reads from Postgres via Drizzle.
 */

import type { CursorV1 } from "@/lib/api";
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
// Pagination / list result
// ---------------------------------------------------------------------------

export interface LoadRateStructuresOptions extends RateStructureFilters {
  sort?: "name";
  order?: "asc" | "desc";
  limit?: number;
  cursor?: CursorV1 | null;
}

export interface RateStructureListResult {
  items: RateStructure[];
  totalCount: number;
  hasMore: boolean;
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
    sourceUrlStatus: nullableString(row.sourceUrlStatus) as "ok" | "dead" | undefined,
    sourceUrlCheckedAt: dateToString(row.sourceUrlCheckedAt),
    createdAt: dateToString(row.createdAt) ?? "",
    updatedAt: dateToString(row.updatedAt) ?? "",
    version: row.version === null || row.version === undefined ? 1 : Number(row.version),
  };
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

async function loadFromDb(options: LoadRateStructuresOptions = {}): Promise<RateStructureListResult> {
  const { getDb } = await import("@/lib/db/client");
  const { rateStructures } = await import("@/lib/db/schema");
  const { eq, ilike, and, or, isNull, gt, lt, asc, desc, count } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  /**
   * Light projection for the list endpoint. The six heavy jsonb columns
   * (energy_rate_structure, schedules, demand structures, net_metering_rules)
   * are intentionally omitted.
   */
  const listColumns = {
    id: rateStructures.id,
    slug: rateStructures.slug,
    name: rateStructures.name,
    eiaId: rateStructures.eiaId,
    utilityId: rateStructures.utilityId,
    regionId: rateStructures.regionId,
    utilityName: rateStructures.utilityName,
    sector: rateStructures.sector,
    serviceType: rateStructures.serviceType,
    fixedCharge: rateStructures.fixedCharge,
    fixedChargeUnits: rateStructures.fixedChargeUnits,
    demandRateUnit: rateStructures.demandRateUnit,
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
    sourceUrlStatus: rateStructures.sourceUrlStatus,
    sourceUrlCheckedAt: rateStructures.sourceUrlCheckedAt,
    createdAt: rateStructures.createdAt,
    updatedAt: rateStructures.updatedAt,
    version: rateStructures.version,
  };

  const db = getDb();
  const conditions: (DrizzleSQL | undefined)[] = [];

  // Exclude soft-deleted entities
  conditions.push(isNull(rateStructures.deletedAt));

  if (options.search) {
    conditions.push(
      or(
        ilike(rateStructures.name, `%${options.search}%`),
        ilike(rateStructures.utilityName, `%${options.search}%`),
        ilike(rateStructures.slug, `%${options.search}%`)
      )
    );
  }

  if (options.sector) conditions.push(eq(rateStructures.sector, options.sector));

  if (typeof options.hasTou === "boolean") {
    conditions.push(eq(rateStructures.hasTou, options.hasTou));
  }
  if (typeof options.hasDemandCharge === "boolean") {
    conditions.push(eq(rateStructures.hasDemandCharge, options.hasDemandCharge));
  }
  if (typeof options.hasNetMetering === "boolean") {
    conditions.push(eq(rateStructures.hasNetMetering, options.hasNetMetering));
  }
  if (typeof options.isEvRate === "boolean") {
    conditions.push(eq(rateStructures.isEvRate, options.isEvRate));
  }

  if (options.utilityId) conditions.push(eq(rateStructures.utilityId, options.utilityId));
  if (options.eiaId !== undefined) conditions.push(eq(rateStructures.eiaId, options.eiaId));

  const where = and(...conditions.filter((c): c is DrizzleSQL => c !== undefined));

  // Cheap indexed count of the filtered set (no cursor predicate, no limit).
  const [{ count: totalCount }] = await db.select({ count: count() }).from(rateStructures).where(where);

  const sort = options.sort ?? "name";
  const order = options.order ?? "asc";
  const limit = options.limit ?? 50;

  // Keyset pagination on (name, id) with a stable id tiebreaker.
  const pageConditions = [...conditions];
  if (options.cursor) {
    const cursorName = options.cursor.s[sort] as string | undefined;
    const cursorId = options.cursor.id;
    if (cursorName !== undefined) {
      if (order === "asc") {
        pageConditions.push(
          or(
            gt(rateStructures.name, cursorName),
            and(eq(rateStructures.name, cursorName), gt(rateStructures.id, cursorId))
          )
        );
      } else {
        pageConditions.push(
          or(
            lt(rateStructures.name, cursorName),
            and(eq(rateStructures.name, cursorName), gt(rateStructures.id, cursorId))
          )
        );
      }
    }
  }

  const pageWhere = and(...pageConditions.filter((c): c is DrizzleSQL => c !== undefined));

  const orderBy =
    order === "asc"
      ? [asc(rateStructures.name), asc(rateStructures.id)]
      : [desc(rateStructures.name), asc(rateStructures.id)];

  // Light projection: omit the six heavy jsonb columns for the list query.
  const rows = await db
    .select(listColumns)
    .from(rateStructures)
    .where(pageWhere)
    .orderBy(...orderBy)
    .limit(limit + 1);

  const items = rows.map((r) => dbRowToRateStructure(r as Record<string, unknown>));
  const hasMore = items.length > limit;
  if (hasMore) {
    items.pop();
  }

  return {
    items,
    totalCount: Number(totalCount ?? 0),
    hasMore,
  };
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
      sourceUrlStatus: rateStructures.sourceUrlStatus,
      sourceUrlCheckedAt: rateStructures.sourceUrlCheckedAt,
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
 * Load rate structures, optionally filtered and paginated.
 *
 * Returns a light projection of each row: the six heavy jsonb columns
 * (energyRateStructure, schedules, demand structures, netMeteringRules) are
 * intentionally omitted for the list query. Use {@link loadRateBySlug} for the
 * full rate structure.
 */
export async function loadRateStructures(options: LoadRateStructuresOptions = {}): Promise<RateStructureListResult> {
  return loadFromDb(options);
}
