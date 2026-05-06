/**
 * GET /api/v1/pricing-nodes/:slug/versions
 *
 * Return the version history for a pricing node. Queries the entity_versions
 * table in the database.
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
import { stripInternal } from "@/lib/api/public-response";
import { loadPricingNodeBySlug } from "@/lib/data/pricing-nodes";

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

        const versions = await loadVersionsFromDb(node.id);

        return jsonResponse(
          {
            data: stripInternal(versions),
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
