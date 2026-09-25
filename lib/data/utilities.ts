/**
 * Server-side utilities data access.
 *
 * Reads from Postgres via Drizzle. Replaces the old lib/data-utilities.ts
 * module, which statically imported the ~3.1 MB data/utilities.json and
 * bundled it into the server on every cold start.
 *
 * DB access uses dynamic imports (matching lib/data/programs.ts and
 * lib/data/ev-stations.ts) so the Postgres client is never pulled into a
 * client bundle even if this module is transitively imported via lib/data.ts.
 *
 * These helpers are async server-side DB reads. Client components must NOT
 * import this module — they use the SWR hooks (useUtility / useUtilityList /
 * useUtilityNames) that hit /api/v1/utilities instead.
 */

import type { Utility, UtilitySegment, UtilityStatus } from "@/types/entities";

// ---------------------------------------------------------------------------
// Row mapping (pure — no DB dependency)
// ---------------------------------------------------------------------------

export function dbRowToUtility(row: Record<string, unknown>): Utility {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    eiaName: (row.eiaName ?? null) as string | null,
    shortName: (row.shortName ?? null) as string | null,
    logo: (row.logo ?? null) as string | null,
    website: (row.website ?? null) as string | null,
    eiaId: (row.eiaId ?? null) as string | null,
    segment: row.segment as UtilitySegment,
    status: row.status as UtilityStatus,
    customerCount: (row.customerCount ?? null) as number | null,
    peakDemandMw: (row.peakDemandMw ?? null) as number | null,
    winterPeakDemandMw: (row.winterPeakDemandMw ?? null) as number | null,
    totalRevenueDollars: (row.totalRevenueDollars ?? null) as number | null,
    totalSalesMwh: (row.totalSalesMwh ?? null) as number | null,
    baCode: (row.baCode ?? null) as string | null,
    nercRegion: (row.nercRegion ?? null) as string | null,
    hasGeneration: (row.hasGeneration ?? null) as boolean | null,
    hasTransmission: (row.hasTransmission ?? null) as boolean | null,
    hasDistribution: (row.hasDistribution ?? null) as boolean | null,
    amiMeterCount: (row.amiMeterCount ?? null) as number | null,
    totalMeterCount: (row.totalMeterCount ?? null) as number | null,
    jurisdiction: (row.jurisdiction ?? null) as string | null,
    isoId: (row.isoId ?? null) as string | null,
    rtoId: (row.rtoId ?? null) as string | null,
    balancingAuthorityId: (row.balancingAuthorityId ?? null) as string | null,
    generationProviderId: (row.generationProviderId ?? null) as string | null,
    transmissionProviderId: (row.transmissionProviderId ?? null) as string | null,
    parentId: (row.parentId ?? null) as string | null,
    successorId: (row.successorId ?? null) as string | null,
    serviceTerritoryId: (row.serviceTerritoryId ?? null) as string | null,
  };
}

// ---------------------------------------------------------------------------
// DB reads (dynamic imports keep the Postgres client out of client bundles)
// ---------------------------------------------------------------------------

/**
 * Explicit column selection matching the public Utility shape, so we never
 * accidentally leak an internal-only column.
 */
async function utilityColumns() {
  const { utilities } = await import("@/lib/db/schema");
  return {
    id: utilities.id,
    slug: utilities.slug,
    name: utilities.name,
    eiaName: utilities.eiaName,
    shortName: utilities.shortName,
    logo: utilities.logo,
    website: utilities.website,
    eiaId: utilities.eiaId,
    segment: utilities.segment,
    status: utilities.status,
    customerCount: utilities.customerCount,
    peakDemandMw: utilities.peakDemandMw,
    winterPeakDemandMw: utilities.winterPeakDemandMw,
    totalRevenueDollars: utilities.totalRevenueDollars,
    totalSalesMwh: utilities.totalSalesMwh,
    baCode: utilities.baCode,
    nercRegion: utilities.nercRegion,
    hasGeneration: utilities.hasGeneration,
    hasTransmission: utilities.hasTransmission,
    hasDistribution: utilities.hasDistribution,
    amiMeterCount: utilities.amiMeterCount,
    totalMeterCount: utilities.totalMeterCount,
    jurisdiction: utilities.jurisdiction,
    isoId: utilities.isoId,
    rtoId: utilities.rtoId,
    balancingAuthorityId: utilities.balancingAuthorityId,
    generationProviderId: utilities.generationProviderId,
    transmissionProviderId: utilities.transmissionProviderId,
    parentId: utilities.parentId,
    successorId: utilities.successorId,
    serviceTerritoryId: utilities.serviceTerritoryId,
  };
}

/**
 * Fetch a single utility by slug. Returns undefined if not found.
 */
export async function getUtilityBySlug(slug: string): Promise<Utility | undefined> {
  const { getDb } = await import("@/lib/db/client");
  const { utilities } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select(await utilityColumns())
    .from(utilities)
    .where(eq(utilities.slug, slug))
    .limit(1);
  return rows.length > 0 ? dbRowToUtility(rows[0] as Record<string, unknown>) : undefined;
}

/**
 * Fetch a single utility by id. Returns undefined if not found.
 */
export async function getUtilityById(id: string): Promise<Utility | undefined> {
  const { getDb } = await import("@/lib/db/client");
  const { utilities } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select(await utilityColumns())
    .from(utilities)
    .where(eq(utilities.id, id))
    .limit(1);
  return rows.length > 0 ? dbRowToUtility(rows[0] as Record<string, unknown>) : undefined;
}

/**
 * Build a slug→name AND id→name lookup map for enrichment (e.g. decorating
 * program organizations with utility display names). Selects only id/slug/name
 * so we never pull the full 3k-row payload into memory.
 */
export async function getUtilityNameMap(): Promise<Map<string, string>> {
  const { getDb } = await import("@/lib/db/client");
  const { utilities } = await import("@/lib/db/schema");

  const db = getDb();
  const rows = await db.select({ id: utilities.id, slug: utilities.slug, name: utilities.name }).from(utilities);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.slug, r.name);
    map.set(r.id, r.name);
  }
  return map;
}
