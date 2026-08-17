/**
 * Factory for `GET /api/v1/<entity>/:slug/versions`.
 *
 * Version history is identical across entity types — only the table to resolve
 * the slug against and the `entity_type` discriminator differ. Both come from
 * the same `ENTITY_TABLES` registry the contribution write path uses, so a type
 * cannot be writable but unreadable, or spelled one way when written and
 * another when read.
 *
 * Slug-keyed types only. `territory` and `transmission_line` have no `slug`
 * column and are addressed by id, so they need a different resolver.
 */

import { and, asc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError, corsHeaders, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { generateRequestId } from "@/lib/api/middleware";
import { stripInternal } from "@/lib/api/public-response";
import { getDb } from "@/lib/db/client";
import { entityVersions } from "@/lib/db/schema";
import { getEntityTable } from "@/lib/mod/apply-contribution";

export interface VersionEntry {
  id: number;
  versionNumber: number;
  changeType: string;
  changeSummary: string | null;
  changedBy: string | null;
  changedAt: string;
  sourceType: string | null;
  delta: Record<string, { old: unknown; new: unknown }> | null;
}

export interface VersionsRouteConfig {
  /** Discriminator stored in `entity_versions.entity_type`, e.g. "power_plant". */
  entityType: string;
  /** Human label used in the not-found message, e.g. "Power plant". */
  label: string;
  /** Cache-Tag prefix, conventionally the entity type, e.g. `power_plant:<slug>:versions`. */
  cacheTag?: string;
}

/**
 * Build the GET handler. Returns versions oldest-first, which is the order the
 * delta chain has to be replayed in to reconstruct a given version.
 */
export function createVersionsRoute(config: VersionsRouteConfig) {
  const { entityType, label } = config;
  const cacheTag = config.cacheTag ?? entityType;

  async function handleGet(_req: Request, ctx: RouteContext) {
    const slug = ctx.params?.slug;
    if (!slug) {
      throw new ApiError("BAD_REQUEST", "Missing slug parameter");
    }

    const table = getEntityTable(entityType);
    if (!table) {
      // Unreachable via the exported routes below, which are all registry
      // members. Guards against a typo'd entityType silently returning [].
      throw new ApiError("INTERNAL_ERROR", `Unknown entity type '${entityType}'`);
    }

    const db = getDb();
    const [entity] = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1);
    if (!entity) {
      throw new ApiError("NOT_FOUND", `${label} '${slug}' not found`);
    }

    const rows = await db
      .select({
        id: entityVersions.id,
        versionNumber: entityVersions.versionNumber,
        changeType: entityVersions.changeType,
        changeSummary: entityVersions.changeSummary,
        changedBy: entityVersions.changedBy,
        changedAt: entityVersions.changedAt,
        sourceType: entityVersions.sourceType,
        delta: entityVersions.delta,
      })
      .from(entityVersions)
      .where(and(eq(entityVersions.entityType, entityType), eq(entityVersions.entityId, entity.id)))
      .orderBy(asc(entityVersions.versionNumber));

    const versions: VersionEntry[] = rows.map((row) => ({
      id: row.id,
      versionNumber: row.versionNumber,
      changeType: row.changeType,
      changeSummary: row.changeSummary ?? null,
      changedBy: row.changedBy ?? null,
      changedAt: row.changedAt.toISOString(),
      sourceType: row.sourceType ?? null,
      delta: (row.delta as Record<string, { old: unknown; new: unknown }>) ?? null,
    }));

    // CORS on every one of these: they are public read-only endpoints on an
    // open-data API. The previous pricing-nodes route sent them and programs
    // did not, which is the kind of drift a shared factory exists to stop.
    return jsonResponse({ data: stripInternal(versions) }, 200, {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Cache-Tag": `${cacheTag}:${slug}:versions`,
      ...corsHeaders(),
    });
  }

  const handler = withApiMiddleware(handleGet);

  return async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    return handler(req, { params: { slug }, requestId: generateRequestId() });
  };
}
