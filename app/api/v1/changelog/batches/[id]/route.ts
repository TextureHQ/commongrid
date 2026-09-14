/**
 * GET /api/v1/changelog/batches/:id — the breakout for one change batch.
 *
 * The changelog feed collapses a sync run into a single row ("EIA-860M sync ·
 * 1,204 records") so a monthly sync does not bury genuine community edits under
 * thousands of lines. This endpoint is the expand: the individual entity
 * versions that batch produced, each linking back to its entity and that
 * entity's own version history.
 *
 * Paginated because a batch can touch tens of thousands of rows. One line per
 * item (entity, change type, one-line summary); the full field-level diff lives
 * on the item's own `/versions` history, which already renders every source.
 */

import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError, corsHeaders, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { generateRequestId } from "@/lib/api/middleware";
import { getDb } from "@/lib/db/client";
import { changeBatches, entityVersions } from "@/lib/db/schema";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Route segment for building an item link, keyed by entity_versions.entity_type. */
const ENTITY_API_SEGMENT: Record<string, string> = {
  utility: "utilities",
  power_plant: "power-plants",
  ev_station: "ev-stations",
  territory: "transmission-lines", // territories are addressed by id, no public slug page
  transmission_line: "transmission-lines",
  pricing_node: "pricing-nodes",
  iso: "isos",
  rto: "rtos",
  balancing_authority: "balancing-authorities",
  region: "regions",
  program: "programs",
};

interface BatchItem {
  versionId: number;
  entityType: string;
  entityId: string;
  entityName: string | null;
  entitySlug: string | null;
  changeType: string;
  changeSummary: string | null;
  changedAt: string;
  /** Deep link to the entity's public page when it has a slug-addressable one. */
  href: string | null;
}

async function handleGet(req: Request, ctx: RouteContext) {
  const id = ctx.params?.id;
  if (!id) throw new ApiError("BAD_REQUEST", "Missing batch id");

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const entityType = url.searchParams.get("entity_type");

  const db = getDb();

  const [batch] = await db
    .select({
      id: changeBatches.id,
      sourceType: changeBatches.sourceType,
      title: changeBatches.title,
      description: changeBatches.description,
      initiatedBy: changeBatches.initiatedBy,
      startedAt: changeBatches.startedAt,
      completedAt: changeBatches.completedAt,
    })
    .from(changeBatches)
    .where(eq(changeBatches.id, id))
    .limit(1);

  if (!batch) throw new ApiError("NOT_FOUND", `Change batch '${id}' not found`);

  // Baselines are excluded everywhere in the changelog: they record the state an
  // entity was already in, not an event where anything changed.
  const typeFilter = entityType
    ? and(eq(entityVersions.entityType, entityType), ne(entityVersions.changeType, "baseline"))
    : ne(entityVersions.changeType, "baseline");

  const where = and(eq(entityVersions.batchId, id), typeFilter);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(entityVersions).where(where);

  const rows = await db
    .select({
      versionId: entityVersions.id,
      entityType: entityVersions.entityType,
      entityId: entityVersions.entityId,
      entityName: entityVersions.entityName,
      entitySlug: entityVersions.entitySlug,
      changeType: entityVersions.changeType,
      changeSummary: entityVersions.changeSummary,
      changedAt: entityVersions.changedAt,
    })
    .from(entityVersions)
    .where(where)
    .orderBy(desc(entityVersions.changedAt), desc(entityVersions.id))
    .limit(limit)
    .offset(offset);

  const items: BatchItem[] = rows.map((row) => ({
    versionId: row.versionId,
    entityType: row.entityType,
    entityId: row.entityId,
    entityName: row.entityName ?? null,
    entitySlug: row.entitySlug ?? null,
    changeType: row.changeType,
    changeSummary: row.changeSummary ?? null,
    changedAt: row.changedAt.toISOString(),
    href: buildHref(row.entityType, row.entitySlug),
  }));

  const total = Number(count ?? 0);

  return jsonResponse(
    {
      batch: {
        id: batch.id,
        sourceType: batch.sourceType,
        title: batch.title,
        description: batch.description ?? null,
        initiatedBy: batch.initiatedBy ?? null,
        startedAt: batch.startedAt.toISOString(),
        completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
      },
      items,
      total,
      hasMore: offset + limit < total,
    },
    200,
    {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "Cache-Tag": `changelog:batch:${id}`,
      ...corsHeaders(),
    }
  );
}

function buildHref(entityType: string, slug: string | null): string | null {
  if (!slug) return null;
  const segment = ENTITY_API_SEGMENT[entityType];
  if (!segment) return null;
  // Territories have no slug-addressable public page; treat as non-linkable.
  if (entityType === "territory") return null;
  return `/${segment}/${slug}`;
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handler(req, { params: { id }, requestId: generateRequestId() });
}
