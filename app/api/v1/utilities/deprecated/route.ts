/**
 * GET /api/v1/utilities/deprecated
 *
 * List utilities that have been retired, merged, renamed, or are known
 * successors of deprecated entities. Backed by the `v_deprecated_utilities`
 * SQL view (migration 0013).
 *
 * Consumers use this to reconcile historical utility names / EIA ids back to
 * the canonical, currently-active record. Example: a researcher ingests a
 * 2018 EIA-861 filing that references "Gulf Power" — this endpoint tells them
 * Gulf Power was merged into Florida Power & Light and returns the successor
 * slug + eia_id so their pipeline can normalise.
 *
 * This is a READ-ONLY view on public data. No auth required beyond the
 * standard public-API rate limits.
 *
 * Query params:
 *   - status=active|retired|merged|renamed   filter by lifecycle status
 *   - successor=<eia_id>                     rows whose successor_eia_id matches
 *   - q=<search>                             case-insensitive name/slug filter
 *   - limit=<n>                              page size (default 100, max 500)
 *   - cursor=<opaque>                        opaque continuation token
 *
 * Response:
 *   {
 *     data: Array<{
 *       eia_id, utility_slug, name,
 *       status: 'active' | 'retired' | 'merged' | 'renamed',
 *       raw_status: 'ACTIVE' | 'DEFUNCT' | 'MERGED' | 'ACQUIRED' | 'PENDING',
 *       effective_from, effective_to,
 *       successor_eia_id, successor_slug,
 *       source, deprecation_reason, notes
 *     }>,
 *     pagination: { cursor, limit, total, hasMore }
 *   }
 */

import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { jsonResponse, paginatedResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const ALLOWED_STATUSES = new Set(["active", "retired", "merged", "renamed"]);

// Cache aggressively — the view's inputs change at most a few times per year
// (new EIA-861 filings, manual lifecycle overrides).
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface DeprecatedUtilityRow {
  eia_id: string;
  utility_slug: string;
  name: string;
  status: "active" | "retired" | "merged" | "renamed";
  raw_status: string;
  effective_from: string | Date | null;
  effective_to: string | Date | null;
  successor_eia_id: string | null;
  successor_slug: string | null;
  source: string;
  deprecation_reason: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function parseOffsetCursor(raw: string | null): number {
  if (!raw) return 0;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { o?: number };
    const offset = typeof parsed.o === "number" ? parsed.o : 0;
    if (!Number.isFinite(offset) || offset < 0) return 0;
    return Math.floor(offset);
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid cursor");
  }
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

async function handleGet(req: Request, _ctx: RouteContext) {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const successorParam = url.searchParams.get("successor");
  const q = url.searchParams.get("q");
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseOffsetCursor(url.searchParams.get("cursor"));

  if (statusParam !== null && !ALLOWED_STATUSES.has(statusParam)) {
    throw new ApiError("VALIDATION_ERROR", `status must be one of: ${[...ALLOWED_STATUSES].join(", ")}`);
  }

  const db = getDb();

  // Build conditional predicate. Drizzle's `sql` template composes safely.
  const conditions: ReturnType<typeof sql>[] = [];
  if (statusParam) {
    conditions.push(sql`status = ${statusParam}`);
  }
  if (successorParam) {
    conditions.push(sql`successor_eia_id = ${successorParam}`);
  }
  if (q) {
    const term = `%${q.trim()}%`;
    conditions.push(sql`(name ILIKE ${term} OR utility_slug ILIKE ${term})`);
  }

  const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const dataQuery = sql`
    SELECT eia_id, utility_slug, name, status, raw_status,
           effective_from, effective_to,
           successor_eia_id, successor_slug,
           source, deprecation_reason, notes
    FROM public.v_deprecated_utilities
    ${whereClause}
    ORDER BY status ASC, name ASC, eia_id ASC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `;

  const countQuery = sql`
    SELECT COUNT(*)::bigint AS count
    FROM public.v_deprecated_utilities
    ${whereClause}
  `;

  const [dataResult, countResult] = await Promise.all([db.execute(dataQuery), db.execute(countQuery)]);

  const dataRows =
    (dataResult as unknown as { rows: DeprecatedUtilityRow[] }).rows ??
    (dataResult as unknown as DeprecatedUtilityRow[]);
  const countRows =
    (countResult as unknown as { rows: Array<{ count: string | number }> }).rows ??
    (countResult as unknown as Array<{ count: string | number }>);

  const hasMore = dataRows.length > limit;
  const page = hasMore ? dataRows.slice(0, limit) : dataRows;
  const total = Number(countRows[0]?.count ?? 0);
  const nextCursor = hasMore ? encodeOffsetCursor(offset + limit) : null;

  return jsonResponse(paginatedResponse(page, total, nextCursor, limit), 200, {
    ...corsHeaders(),
    "Cache-Control": CACHE_CONTROL,
  });
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest) {
  return handler(req, { requestId: generateRequestId() });
}
