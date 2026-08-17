/**
 * Point-in-time reads via `?at=<date|timestamp>` on slug detail endpoints.
 *
 * Reconstructs the entity from `entity_versions` (v1 snapshot + deltas) at the
 * latest version whose `changed_at` is ≤ the requested instant. Date-only
 * values (`YYYY-MM-DD`) mean end of that UTC calendar day so the whole day is
 * included.
 */

import { and, asc, eq } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import { publicJsonResponse } from "@/lib/api/public-response";
import { getDb } from "@/lib/db/client";
import { entityVersions } from "@/lib/db/schema";
import { reconstructEntityAtVersion } from "@/lib/db/versioning";
import { API_SEGMENT_TO_ENTITY_TYPE } from "@/lib/entity-routes";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface PointInTimeSnapshot {
  entity: Record<string, unknown>;
  versionNumber: number;
  changedAt: Date;
  requestedAt: Date;
}

export interface AsOfMeta {
  requested: string;
  versionNumber: number;
  changedAt: string;
}

/**
 * Parse `?at=`. Returns null when absent. Throws VALIDATION_ERROR when present
 * but empty or unparseable.
 */
export function parseAtParam(searchParams: URLSearchParams): Date | null {
  if (!searchParams.has("at")) return null;
  const raw = searchParams.get("at");
  if (raw === null || raw.trim() === "") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "The `at` query parameter must be a date (YYYY-MM-DD) or ISO-8601 timestamp.",
      { field: "at" }
    );
  }
  const trimmed = raw.trim();
  const date = DATE_ONLY.test(trimmed) ? new Date(`${trimmed}T23:59:59.999Z`) : new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "The `at` query parameter must be a date (YYYY-MM-DD) or ISO-8601 timestamp.",
      { field: "at", value: trimmed }
    );
  }
  return date;
}

/**
 * True for `GET /api/v1/{segment}/{slug}` where `segment` is a versioned
 * slug-keyed entity type. Sub-resources (`/versions`, `/geometry`, …) are false.
 */
export function supportsPointInTimeReads(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = path.match(/^\/api\/v1\/([^/]+)\/([^/]+)$/);
  if (!match) return false;
  return match[1] in API_SEGMENT_TO_ENTITY_TYPE;
}

/**
 * Validate `?at=` early in middleware: allow only on eligible detail paths so
 * list/sub-resource handlers never silently ignore a historical-looking URL.
 */
export function enforceAtQueryPolicy(url: URL): void {
  if (!url.searchParams.has("at")) return;
  parseAtParam(url.searchParams);
  if (!supportsPointInTimeReads(url.pathname)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "The `at` query parameter is only supported on entity detail endpoints (GET /api/v1/{type}/{slug}). Use GET .../versions for full history.",
      { field: "at" }
    );
  }
}

export function asOfMeta(snap: PointInTimeSnapshot): AsOfMeta {
  return {
    requested: snap.requestedAt.toISOString(),
    versionNumber: snap.versionNumber,
    changedAt: snap.changedAt.toISOString(),
  };
}

/**
 * Load versions for an entity and reconstruct the state as of `at`.
 * Returns null when no version exists with `changed_at` ≤ `at`.
 */
export async function loadEntityAtTimestamp(
  entityType: string,
  entityId: string,
  at: Date
): Promise<PointInTimeSnapshot | null> {
  const db = getDb();
  const rows = await db
    .select({
      versionNumber: entityVersions.versionNumber,
      snapshot: entityVersions.snapshot,
      delta: entityVersions.delta,
      changedAt: entityVersions.changedAt,
    })
    .from(entityVersions)
    .where(and(eq(entityVersions.entityType, entityType), eq(entityVersions.entityId, entityId)))
    .orderBy(asc(entityVersions.versionNumber));

  if (rows.length === 0) return null;

  let targetVersion: number | null = null;
  let targetChangedAt: Date | null = null;
  for (const row of rows) {
    const changedAt = row.changedAt instanceof Date ? row.changedAt : new Date(String(row.changedAt));
    if (Number.isNaN(changedAt.getTime())) continue;
    if (changedAt.getTime() <= at.getTime() && (targetVersion === null || row.versionNumber > targetVersion)) {
      targetVersion = row.versionNumber;
      targetChangedAt = changedAt;
    }
  }
  if (targetVersion === null || targetChangedAt === null) return null;

  const entity = reconstructEntityAtVersion(
    rows.map((row) => ({
      versionNumber: row.versionNumber,
      snapshot: (row.snapshot ?? null) as Record<string, unknown> | null,
      delta: (row.delta ?? null) as Record<string, { old: unknown; new: unknown }> | null,
    })),
    targetVersion
  );
  if (!entity) return null;

  return {
    entity,
    versionNumber: targetVersion,
    changedAt: targetChangedAt,
    requestedAt: at,
  };
}

/**
 * Resolve a point-in-time snapshot and return a public `{ data }` response.
 * Throws NOT_FOUND when no version exists at or before `at`.
 */
export async function pointInTimeJsonResponse(options: {
  entityType: string;
  entityId: string;
  at: Date;
  label: string;
  slug: string;
  headers?: Record<string, string>;
  fields?: string[] | string | null;
}): Promise<Response> {
  const snap = await loadEntityAtTimestamp(options.entityType, options.entityId, options.at);
  if (!snap) {
    throw new ApiError(
      "NOT_FOUND",
      `No version of ${options.label} '${options.slug}' exists at or before ${options.at.toISOString()}`,
      { field: "at", at: options.at.toISOString() }
    );
  }

  return publicJsonResponse(
    { ...snap.entity, _as_of: asOfMeta(snap) },
    200,
    {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      ...options.headers,
    },
    { fields: options.fields }
  );
}
