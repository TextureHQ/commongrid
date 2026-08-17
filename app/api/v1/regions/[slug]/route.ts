import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { parseAtParam, pointInTimeJsonResponse } from "@/lib/api/point-in-time";
import { publicJsonResponse } from "@/lib/api/public-response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { regions } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/regions/[slug] — Get region by slug
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const at = parseAtParam(new URL(req.url).searchParams);
  const db = getDb();
  const [region] = await db.select().from(regions).where(eq(regions.slug, slug)).limit(1);

  if (!region) {
    throw new ApiError("NOT_FOUND", `Region '${slug}' not found`);
  }

  if (at) {
    return pointInTimeJsonResponse({
      entityType: "region",
      entityId: region.id,
      at,
      label: "Region",
      slug,
      headers: { "Cache-Tag": `region:${slug}` },
    });
  }

  return publicJsonResponse(region, 200);
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
