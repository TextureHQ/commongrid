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

import { and, asc, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError, corsHeaders, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { generateRequestId } from "@/lib/api/middleware";
import { stripInternal } from "@/lib/api/public-response";
import { getDb } from "@/lib/db/client";
import { entityVersions } from "@/lib/db/schema";
import { getEntityTable } from "@/lib/mod/apply-contribution";

/** Statuses whose rows point at a replacement entity. Utilities only today. */
const REDIRECT_STATUSES = new Set(["MERGED", "ACQUIRED"]);

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
  /** Human label for the not-found message, e.g. "Power plant". */
  label: string;
  /**
   * Cache-Tag prefix. Required, and deliberately not defaulted from
   * `entityType`: tags are kebab-case repo-wide (`pricing-node`) while
   * `entityType` is snake_case (`pricing_node`). Defaulting silently changed
   * the tag on an existing route, and `POST /api/revalidate` accepts any string,
   * so a stale purge no-ops instead of erroring.
   */
  cacheTag: string;
  /** Route segment, for the canonical Link on superseded entities. */
  apiSegment: string;
}

export function createVersionsRoute(config: VersionsRouteConfig) {
  const { entityType, label, cacheTag, apiSegment } = config;

  async function handleGet(_req: Request, ctx: RouteContext) {
    const slug = ctx.params?.slug;
    if (!slug) {
      throw new ApiError("BAD_REQUEST", "Missing slug parameter");
    }

    const table = getEntityTable(entityType);
    if (!table) {
      throw new ApiError("INTERNAL_ERROR", `Unknown entity type '${entityType}'`);
    }

    const db = getDb();

    // deleted_at IS NULL to match the detail routes. Without it a soft-deleted
    // entity 404s on its detail route while still serving history here.
    const [entity] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.slug, slug), isNull(table.deletedAt)))
      .limit(1);

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

    const headers: Record<string, string> = {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      "Cache-Tag": `${cacheTag}:${slug}:versions`,
      ...corsHeaders(),
    };

    // Superseded entities return their OWN history, not the successor's, and
    // advertise the successor via Link. The detail route follows the successor
    // because callers want current facts; history is the opposite — replaying
    // the successor's versions under this slug would attribute another entity's
    // edits to this one, which for an audit surface is worse than a redirect.
    // Second lookup rather than widening the select above: only `utilities`
    // carries these columns, so eight of the nine routes never run it.
    if (table.successorId && table.status) {
      const [meta] = await db
        .select({ status: table.status, successorId: table.successorId })
        .from(table)
        .where(eq(table.id, entity.id))
        .limit(1);

      if (meta?.successorId && REDIRECT_STATUSES.has(meta.status)) {
        const [successor] = await db
          .select({ slug: table.slug })
          .from(table)
          .where(eq(table.id, meta.successorId))
          .limit(1);
        if (successor?.slug) {
          headers.Link = `</api/v1/${apiSegment}/${successor.slug}/versions>; rel="successor"`;
        }
      }
    }

    return jsonResponse({ data: stripInternal(versions) }, 200, headers);
  }

  const handler = withApiMiddleware(handleGet);

  return async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    return handler(req, { params: { slug }, requestId: generateRequestId() });
  };
}
