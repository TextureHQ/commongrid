/**
 * GET /api/v1/pricing-nodes/:slug/versions
 *
 * Return the version history for a pricing node. Queries the entity_versions
 * table when the DB flag is active; returns an empty list in JSON mode
 * (no version history is stored in static JSON files).
 */

import {
  ApiError,
  corsHeaders,
  jsonResponse,
  type RouteContext,
  withErrorHandling,
  withRequestId,
  withTiming,
} from "@/lib/api";
import { loadPricingNodeBySlug } from "@/lib/data/pricing-nodes";
import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionEntry {
  id: number;
  versionNumber: number;
  changeType: string;
  changeSummary: string | null;
  changedBy: string | null;
  changedAt: string;
  delta: Record<string, { old: unknown; new: unknown }> | null;
}

// ---------------------------------------------------------------------------
// DB version loading
// ---------------------------------------------------------------------------

async function loadVersionsFromDb(entityId: string): Promise<VersionEntry[]> {
  const { getDb } = await import("@/lib/db/client");
  const { entityVersions } = await import("@/lib/db/schema");
  const { eq, and, asc } = await import("drizzle-orm");

  const db = getDb();

  const rows = await db
    .select({
      id: entityVersions.id,
      versionNumber: entityVersions.versionNumber,
      changeType: entityVersions.changeType,
      changeSummary: entityVersions.changeSummary,
      changedBy: entityVersions.changedBy,
      changedAt: entityVersions.changedAt,
      delta: entityVersions.delta,
    })
    .from(entityVersions)
    .where(and(eq(entityVersions.entityType, "pricing_node"), eq(entityVersions.entityId, entityId)))
    .orderBy(asc(entityVersions.versionNumber));

  return rows.map((row) => ({
    id: row.id,
    versionNumber: row.versionNumber,
    changeType: row.changeType,
    changeSummary: row.changeSummary ?? null,
    changedBy: row.changedBy ?? null,
    changedAt: row.changedAt.toISOString(),
    delta: (row.delta as Record<string, { old: unknown; new: unknown }>) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  return withRequestId(
    withErrorHandling(
      withTiming(async (_r: Request, _ctx: RouteContext) => {
        // Verify the node exists (works in both JSON and DB mode)
        const node = await loadPricingNodeBySlug(slug);
        if (!node) {
          throw new ApiError("NOT_FOUND", `Pricing node '${slug}' not found`);
        }

        // Version history is only available in database mode
        let versions: VersionEntry[] = [];
        if (getDataSource("pricingNodes") === "database") {
          versions = await loadVersionsFromDb(node.id);
        }

        return jsonResponse(
          {
            data: versions,
            meta: { source: getDataSource("pricingNodes") },
          },
          200,
          {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            "Cache-Tag": `pricing-node:${slug}:versions`,
            ...corsHeaders(),
          }
        );
      })
    )
  )(req, { requestId: "" });
}
