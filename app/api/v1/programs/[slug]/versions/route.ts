/**
 * GET /api/v1/programs/:slug/versions
 *
 * Return the version history for a program. Queries the entity_versions
 * table when the DB flag is active; returns an empty list in JSON mode
 * (no version history is stored in static JSON files).
 */

import {
  ApiError,
  jsonResponse,
  type RouteContext,
  withCors,
  withErrorHandling,
  withRequestId,
  withTiming,
} from "@/lib/api";
import { loadProgramBySlug } from "@/lib/data/programs";
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
    .where(and(eq(entityVersions.entityType, "program"), eq(entityVersions.entityId, entityId)))
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
      withTiming(
        withCors(async (_r: Request, _ctx: RouteContext) => {
          // Verify the program exists (works in both JSON and DB mode)
          const program = await loadProgramBySlug(slug);
          if (!program) {
            throw new ApiError("NOT_FOUND", `Program '${slug}' not found`);
          }

          // Version history is only available in database mode
          let versions: VersionEntry[] = [];
          if (getDataSource("programs") === "db") {
            versions = await loadVersionsFromDb(program.id);
          }

          return jsonResponse(
            {
              data: versions,
              meta: { source: getDataSource("programs") },
            },
            200,
            {
              "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
              "Cache-Tag": `program:${slug}:versions`,
            }
          );
        })
      )
    )
  )(req, { requestId: "" });
}
