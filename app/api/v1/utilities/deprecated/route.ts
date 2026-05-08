/**
 * GET /api/v1/utilities/deprecated
 *
 * Public lifecycle feed of utilities whose EIA id has been deprecated
 * (merged into a successor, acquired by another utility, or dissolved /
 * retired). Covenant-compliant by construction — useful to any consumer
 * maintaining longitudinal references to utility lifecycle:
 *
 *   - Journalists tracking utility consolidation.
 *   - Researchers joining historical datasets whose rows key on an EIA id.
 *   - Integrators keeping a cache of CommonGrid keys fresh by polling
 *     `?since=<last_sync_at>`.
 *
 * A utility is considered "deprecated" when:
 *   - status IN ('MERGED', 'ACQUIRED', 'DEFUNCT')
 *   - deleted_at IS NULL
 *
 * (`PENDING` utilities have never been active and are not deprecated;
 * they're filtered out. Soft-deleted rows never surface through any public
 * endpoint.)
 *
 * Query parameters
 * ----------------
 *   since  — ISO 8601 timestamp. Only include rows whose effective
 *            deprecation timestamp is strictly after this. The effective
 *            timestamp is `COALESCE(deprecated_at, updated_at)` — the
 *            precise `deprecated_at` column when populated, otherwise the
 *            row's `updated_at` as a best-effort fallback for rows that
 *            predate the column.
 *   state  — Two-letter US state/jurisdiction code. Case-insensitive.
 *   limit  — 1..500, default 100.
 *   offset — >= 0, default 0.
 *
 * Response (200)
 * --------------
 *   {
 *     "data": [
 *       {
 *         "eia_id": string | null,
 *         "slug": string,
 *         "name": string,
 *         "state": string | null,
 *         "deprecated_at": string,         // ISO 8601; falls back to updated_at when the precise column is null
 *         "successor_eia_id": string | null,
 *         "deprecation_reason": string | null
 *       }
 *     ],
 *     "pagination": { "total": number, "limit": number, "offset": number }
 *   }
 *
 * Cache
 * -----
 *   Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
 *
 * Deprecation list changes rarely (EIA id reassignments happen handfuls
 * of times per year), so a generous edge cache is appropriate and matches
 * the semantics of other public utility endpoints.
 */

import { aliasedTable, and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { utilities } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Deprecated-status enum values on `utilities.status`. */
const DEPRECATED_STATUSES = ["MERGED", "ACQUIRED", "DEFUNCT"] as const;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MIN_LIMIT = 1;
const MIN_OFFSET = 0;

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

// ---------------------------------------------------------------------------
// Parameter parsing
// ---------------------------------------------------------------------------

interface DeprecatedQuery {
  since: Date | null;
  state: string | null;
  limit: number;
  offset: number;
}

function parseLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ApiError("BAD_REQUEST", "limit must be an integer");
  }
  if (n < MIN_LIMIT || n > MAX_LIMIT) {
    throw new ApiError("BAD_REQUEST", `limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`);
  }
  return n;
}

function parseOffset(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_OFFSET) {
    throw new ApiError("BAD_REQUEST", `offset must be a non-negative integer`);
  }
  return n;
}

function parseSince(raw: string | null): Date | null {
  if (raw === null || raw.trim() === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError("BAD_REQUEST", "since must be a valid ISO 8601 timestamp");
  }
  return d;
}

function parseState(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  const trimmed = raw.trim();
  if (!/^[A-Za-z]{2}$/.test(trimmed)) {
    throw new ApiError("BAD_REQUEST", "state must be a two-letter code");
  }
  return trimmed.toUpperCase();
}

function parseQuery(req: Request): DeprecatedQuery {
  const url = new URL(req.url);
  return {
    since: parseSince(url.searchParams.get("since")),
    state: parseState(url.searchParams.get("state")),
    limit: parseLimit(url.searchParams.get("limit")),
    offset: parseOffset(url.searchParams.get("offset")),
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

interface DeprecatedRow {
  eia_id: string | null;
  slug: string;
  name: string;
  state: string | null;
  deprecated_at: string;
  successor_eia_id: string | null;
  deprecation_reason: string | null;
}

async function handleGet(req: Request, _ctx: RouteContext): Promise<Response> {
  const q = parseQuery(req);

  const db = getDb();
  if (!db) {
    throw new ApiError("INTERNAL_ERROR", "Database not configured");
  }

  // Self-join on utilities to resolve successor_id → successor.eia_id.
  // Using an alias keeps Drizzle's typing happy for the join.
  const successor = aliasedTable(utilities, "successor");

  // Effective deprecation timestamp: precise column when populated, otherwise updated_at fallback.
  const effectiveDeprecatedAt = sql<string>`COALESCE(${utilities.deprecatedAt}, ${utilities.updatedAt})`;

  const baseConditions = [
    isNull(utilities.deletedAt),
    inArray(utilities.status, DEPRECATED_STATUSES as unknown as string[]),
  ];
  if (q.state) {
    baseConditions.push(eq(utilities.jurisdiction, q.state));
  }
  if (q.since) {
    baseConditions.push(gt(effectiveDeprecatedAt, q.since.toISOString()));
  }

  const whereClause = and(...baseConditions);

  // Count for pagination.
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(utilities).where(whereClause);

  // Stable ordering: most-recently-deprecated first, then slug as tiebreaker.
  interface QueryRow {
    eiaId: string | null;
    slug: string;
    name: string;
    state: string | null;
    deprecatedAt: string | Date;
    successorEiaId: string | null;
    deprecationReason: string | null;
  }

  const rows = (await db
    .select({
      eiaId: utilities.eiaId,
      slug: utilities.slug,
      name: utilities.name,
      state: utilities.jurisdiction,
      deprecatedAt: effectiveDeprecatedAt,
      successorEiaId: successor.eiaId,
      deprecationReason: utilities.deprecationReason,
    })
    .from(utilities)
    .leftJoin(successor, eq(utilities.successorId, successor.id))
    .where(whereClause)
    .orderBy(sql`COALESCE(${utilities.deprecatedAt}, ${utilities.updatedAt}) DESC`, asc(utilities.slug))
    .limit(q.limit)
    .offset(q.offset)) as unknown as QueryRow[];

  const data: DeprecatedRow[] = rows.map((r) => {
    // Always normalize to ISO 8601 — Postgres returns `COALESCE(...)` as a
    // raw string (`2026-04-15 16:22:32.101053+00`), which isn't valid
    // ISO 8601. Wrapping in `new Date(...)` before `.toISOString()`
    // coerces it into the canonical `YYYY-MM-DDTHH:mm:ss.sssZ` form
    // every consumer expects.
    const ts = r.deprecatedAt instanceof Date ? r.deprecatedAt : new Date(r.deprecatedAt);
    return {
      eia_id: r.eiaId,
      slug: r.slug,
      name: r.name,
      state: r.state,
      deprecated_at: ts.toISOString(),
      successor_eia_id: r.successorEiaId,
      deprecation_reason: r.deprecationReason,
    };
  });

  return jsonResponse(
    {
      data,
      pagination: {
        total: Number(count ?? 0),
        limit: q.limit,
        offset: q.offset,
      },
    },
    200,
    {
      ...corsHeaders(),
      "Cache-Control": CACHE_CONTROL,
    }
  );
}

// ---------------------------------------------------------------------------
// Next.js route export
// ---------------------------------------------------------------------------

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest, _ctx: unknown = {}): Promise<Response> {
  return handler(req, { requestId: generateRequestId() });
}
