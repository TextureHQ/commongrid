import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { publicJsonResponse } from "@/lib/api/public-response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { regions } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/regions/[slug] — Get region by slug
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const db = getDb();
  const [region] = await db.select().from(regions).where(eq(regions.slug, slug)).limit(1);

  if (!region) {
    throw new ApiError("NOT_FOUND", `Region '${slug}' not found`);
  }

  return publicJsonResponse(region, 200);
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
