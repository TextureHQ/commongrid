/**
 * GET /api/v1/search
 *
 * Global search across all entity types. Returns grouped results by entity
 * type with a configurable per-type limit.
 *
 * Query parameters:
 *   q       (required) Search query, min 2 chars.
 *   limit   Max results per entity type. Default 5, max 25.
 *   types   Comma-separated entity type filter
 *           (e.g. "utilities,power-plants"). Defaults to all types.
 *
 * Data source is controlled per-entity by NEXT_PUBLIC_FF_DB_* feature flags.
 * JSON mode targets <500 ms (data loaded lazily, cached in-process).
 * DB mode stubs return empty results until pg_trgm/tsvector is implemented.
 */

import { z } from "zod";

import {
  ApiError,
  withErrorHandling,
  withRequestId,
  withTiming,
  jsonResponse,
  corsHeaders,
} from "@/lib/api";
import {
  searchAll,
  type EntityType,
  type SearchResult,
} from "@/lib/data/search";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  q: z.string().min(2, "Query must be at least 2 characters").max(200),
  limit: z.coerce.number().int().min(1).max(25).default(5),
  types: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Response key mapping
// ---------------------------------------------------------------------------

/** Maps internal EntityType (singular, kebab) → camelCase response group key. */
const ENTITY_TYPE_TO_KEY: Record<EntityType, string> = {
  utility: "utilities",
  program: "programs",
  "power-plant": "powerPlants",
  "ev-station": "evStations",
  "pricing-node": "pricingNodes",
  "transmission-line": "transmissionLines",
  iso: "isos",
  rto: "rtos",
  "balancing-authority": "balancingAuthorities",
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);

  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid query parameters", {
      issues: parsed.error.issues,
    });
  }

  const { q, limit, types: rawTypes } = parsed.data;

  const types = rawTypes
    ? rawTypes
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  const { results, source } = await searchAll(q, { types, limit });

  // Build grouped response — only include types that were searched
  const data: Record<string, (SearchResult & { type: EntityType })[]> = {};
  let totalResults = 0;

  for (const [entityType, items] of results) {
    const key = ENTITY_TYPE_TO_KEY[entityType];
    data[key] = items.map((r) => ({ ...r, type: entityType }));
    totalResults += items.length;
  }

  return jsonResponse(
    {
      data,
      meta: {
        query: q,
        totalResults,
        source,
      },
    },
    200,
    {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      "Cache-Tag": "search",
      ...corsHeaders(),
    }
  );
}

export async function GET(req: Request): Promise<Response> {
  return withRequestId(withErrorHandling(withTiming(handler)))(req, {
    requestId: "",
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
