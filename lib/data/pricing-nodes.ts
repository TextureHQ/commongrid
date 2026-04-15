/**
 * Data loading abstraction for pricing nodes.
 *
 * Reads from static JSON (default) or Postgres via Drizzle, controlled by
 * the NEXT_PUBLIC_FF_DB_PRICING_NODES feature flag.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { getDataSource } from "@/lib/feature-flags";
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
// JSON source
// ---------------------------------------------------------------------------

let _jsonCache: PricingNode[] | null = null;

function loadJson(): PricingNode[] {
  if (_jsonCache) return _jsonCache;
  const filePath = join(process.cwd(), "data", "pricing-nodes.json");
  _jsonCache = JSON.parse(readFileSync(filePath, "utf-8")) as PricingNode[];
  return _jsonCache;
}

function applyJsonFilters(
  nodes: PricingNode[],
  filters: PricingNodeFilters
): PricingNode[] {
  let result = nodes;

  if (filters.iso) {
    result = result.filter((n) => n.iso === filters.iso);
  }
  if (filters.nodeType) {
    result = result.filter((n) => n.nodeType === filters.nodeType);
  }
  if (filters.state) {
    result = result.filter((n) => n.state === filters.state);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (n) =>
        n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q)
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// DB source
// ---------------------------------------------------------------------------

function dbRowToPricingNode(row: Record<string, unknown>): PricingNode {
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
  const { eq, ilike, and } = await import("drizzle-orm");
  type DrizzleSQL = ReturnType<typeof eq>;

  const db = getDb();
  const conditions: DrizzleSQL[] = [];

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
    .where(conditions.length > 0 ? and(...conditions) : undefined);

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
 * Uses JSON or DB depending on the NEXT_PUBLIC_FF_DB_PRICING_NODES flag.
 */
export async function loadPricingNodes(
  filters?: PricingNodeFilters
): Promise<PricingNode[]> {
  if (getDataSource("pricingNodes") === "database") {
    return loadFromDb(filters);
  }

  const nodes = loadJson();
  return filters ? applyJsonFilters(nodes, filters) : nodes;
}

/**
 * Load a single pricing node by slug.
 * Returns null if not found.
 */
export async function loadPricingNodeBySlug(
  slug: string
): Promise<PricingNode | null> {
  if (getDataSource("pricingNodes") === "database") {
    return loadBySlugFromDb(slug);
  }

  const nodes = loadJson();
  return nodes.find((n) => n.slug === slug) ?? null;
}
