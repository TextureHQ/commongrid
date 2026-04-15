/**
 * GET /api/v1/search
 *
 * Global cross-entity search across utilities, power plants, programs,
 * and pricing nodes. JSON mode uses simple string matching; database mode
 * is planned for a future iteration.
 *
 * Query params:
 *   ?q=duke+energy    — Search query (min 2 chars)
 *   ?limit=5          — Max results per entity type (default 5, max 20)
 *
 * Spec ref: §4.7
 */

import {
  ApiError,
  withApiMiddleware,
  jsonResponse,
  type RouteContext,
} from "@/lib/api";
import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  entityType: string;
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
}

// ---------------------------------------------------------------------------
// JSON mode search helpers
// ---------------------------------------------------------------------------

async function searchUtilities(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  if (getDataSource("utilities") !== "json") return [];

  const utilities = (await import("@/data/utilities.json")).default;
  return utilities
    .filter(
      (u: { name?: string; eiaName?: string | null }) =>
        u.name?.toLowerCase().includes(query) ||
        u.eiaName?.toLowerCase().includes(query)
    )
    .slice(0, limit)
    .map(
      (u: {
        id: string;
        slug: string;
        name: string;
        segment?: string | null;
      }) => ({
        entityType: "utility" as const,
        id: u.id,
        slug: u.slug,
        name: u.name,
        subtitle: u.segment ?? null,
      })
    );
}

async function searchPowerPlants(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  if (getDataSource("powerPlants") !== "json") return [];

  const plants = (await import("@/data/power-plants.json")).default;
  return plants
    .filter(
      (p: { name?: string; utilityName?: string | null }) =>
        p.name?.toLowerCase().includes(query) ||
        p.utilityName?.toLowerCase().includes(query)
    )
    .slice(0, limit)
    .map(
      (p: {
        id: string;
        slug: string;
        name: string;
        fuelCategory?: string | null;
      }) => ({
        entityType: "power_plant" as const,
        id: p.id,
        slug: p.slug,
        name: p.name,
        subtitle: p.fuelCategory ?? null,
      })
    );
}

async function searchPrograms(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  if (getDataSource("programs") !== "json") return [];

  const programs = (await import("@/data/programs.json")).default;
  return programs
    .filter((p: { name?: string }) => p.name?.toLowerCase().includes(query))
    .slice(0, limit)
    .map(
      (p: {
        id: string;
        slug: string;
        name: string;
        status?: string | null;
      }) => ({
        entityType: "program" as const,
        id: p.id,
        slug: p.slug,
        name: p.name,
        subtitle: p.status ?? null,
      })
    );
}

async function searchPricingNodes(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  if (getDataSource("pricingNodes") !== "json") return [];

  const nodes = (await import("@/data/pricing-nodes.json")).default;
  return nodes
    .filter((n: { name?: string }) => n.name?.toLowerCase().includes(query))
    .slice(0, limit)
    .map(
      (n: {
        id: string;
        slug: string;
        name: string;
        iso?: string | null;
      }) => ({
        entityType: "pricing_node" as const,
        id: n.id,
        slug: n.slug,
        name: n.name,
        subtitle: n.iso ?? null,
      })
    );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const handler = withApiMiddleware(
  async (r: Request, _ctx: RouteContext) => {
    const url = new URL(r.url);
    const q = url.searchParams.get("q");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam) || 5, 1), 20);

    if (!q || q.length < 2) {
      throw new ApiError(
        "BAD_REQUEST",
        "q parameter is required (minimum 2 characters)"
      );
    }

    const query = q.toLowerCase();

    // Run all searches in parallel
    const [utilities, powerPlants, programs, pricingNodes] =
      await Promise.all([
        searchUtilities(query, limit),
        searchPowerPlants(query, limit),
        searchPrograms(query, limit),
        searchPricingNodes(query, limit),
      ]);

    const results = [
      ...utilities,
      ...powerPlants,
      ...programs,
      ...pricingNodes,
    ];

    return jsonResponse(
      {
        data: results,
        meta: {
          query: q,
          total: results.length,
          counts: {
            utilities: utilities.length,
            powerPlants: powerPlants.length,
            programs: programs.length,
            pricingNodes: pricingNodes.length,
          },
        },
      },
      200,
      {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      }
    );
  }
);

export async function GET(req: Request): Promise<Response> {
  return handler(req, { requestId: "" });
}
