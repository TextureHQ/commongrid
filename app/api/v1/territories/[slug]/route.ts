import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { publicJsonResponse } from "@/lib/api/public-response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { regions, territories } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/territories/[slug] — Get territory by slug
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  // Territories are database-only — ignore the feature flag.
  // JSON mode was never implemented; fall through to DB.
  return handleDatabaseDetail(slug);
}

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------

async function handleDatabaseDetail(slug: string) {
  const db = getDb();

  // Join territories with regions to get territory by region slug
  const results = await db
    .select({
      id: territories.id,
      regionId: territories.regionId,
      areaSqKm: territories.areaSqKm,
      vertexCount: territories.vertexCount,
      source: territories.source,
      sourceUrl: territories.sourceUrl,
      createdAt: territories.createdAt,
      updatedAt: territories.updatedAt,
      // From regions
      slug: regions.slug,
      name: regions.name,
      type: regions.type,
      state: regions.state,
      eiaId: regions.eiaId,
      customers: regions.customers,
    })
    .from(territories)
    .innerJoin(regions, eq(territories.regionId, regions.id))
    .where(eq(regions.slug, slug))
    .limit(1);

  if (results.length === 0) {
    throw new ApiError("NOT_FOUND", `Territory '${slug}' not found`);
  }

  return publicJsonResponse(results[0], 200);
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
