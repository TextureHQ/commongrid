/**
 * Data loading abstraction for pricing nodes.
 *
 * Reads from Postgres via Drizzle.
 */

import type { IsoRto, PricingNode, PricingNodeType } from "@/types/pricing-nodes";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface PricingNodeFilters {
  iso?: string;
  nodeType?: string;
  state?: string;
  /** Min 2 chars. Matches against name and slug (case-insensitive). */
  search?: string;
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

export function dbRowToPricingNode(row: Record<string, unknown>): PricingNode {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    iso: row.iso as IsoRto,
    nodeType: row.nodeType as PricingNodeType,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    zone: (row.zone as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    voltageKv: (row.voltageKv as number | null) ?? null,
    eiaPlantCode: (row.eiaPlantCode as string | null) ?? null,
    source: row.source as string,
  };
}

async function loadFromDb(filters?: PricingNodeFilters): Promise<PricingNode[]> {
  const { getDb } = await import("@/lib/db/client");
  const { pricingNodes } = await import("@/lib/db/schema");
  const { eq, ilike, and, isNull } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

  // Exclude soft-deleted entities
  conditions.push(isNull(pricingNodes.deletedAt));
  if (filters?.iso) conditions.push(eq(pricingNodes.iso, filters.iso));
  if (filters?.nodeType) conditions.push(eq(pricingNodes.nodeType, filters.nodeType));
  if (filters?.state) conditions.push(eq(pricingNodes.state, filters.state));
  if (filters?.search) conditions.push(ilike(pricingNodes.name, `%${filters.search}%`));

  const rows = await db
    .select({
      id: pricingNodes.id,
      slug: pricingNodes.slug,
      name: pricingNodes.name,
      iso: pricingNodes.iso,
      nodeType: pricingNodes.nodeType,
      latitude: pricingNodes.latitude,
      longitude: pricingNodes.longitude,
      zone: pricingNodes.zone,
      state: pricingNodes.state,
      voltageKv: pricingNodes.voltageKv,
      eiaPlantCode: pricingNodes.eiaPlantCode,
      source: pricingNodes.source,
    })
    .from(pricingNodes)
    .where(and(...conditions));

  return rows.map(dbRowToPricingNode);
}

async function loadBySlugFromDb(slug: string): Promise<PricingNode | null> {
  const { getDb } = await import("@/lib/db/client");
  const { pricingNodes } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const rows = await db
    .select({
      id: pricingNodes.id,
      slug: pricingNodes.slug,
      name: pricingNodes.name,
      iso: pricingNodes.iso,
      nodeType: pricingNodes.nodeType,
      latitude: pricingNodes.latitude,
      longitude: pricingNodes.longitude,
      zone: pricingNodes.zone,
      state: pricingNodes.state,
      voltageKv: pricingNodes.voltageKv,
      eiaPlantCode: pricingNodes.eiaPlantCode,
      source: pricingNodes.source,
    })
    .from(pricingNodes)
    .where(eq(pricingNodes.slug, slug))
    .limit(1);

  return rows.length > 0 ? dbRowToPricingNode(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load pricing nodes, optionally filtered.
 */
export async function loadPricingNodes(filters?: PricingNodeFilters): Promise<PricingNode[]> {
  return loadFromDb(filters);
}

/**
 * Load a single pricing node by slug.
 * Returns null if not found.
 */
export async function loadPricingNodeBySlug(slug: string): Promise<PricingNode | null> {
  return loadBySlugFromDb(slug);
}
