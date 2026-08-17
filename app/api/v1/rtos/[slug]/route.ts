import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { parseAtParam, pointInTimeJsonResponse } from "@/lib/api/point-in-time";
import { publicJsonResponse } from "@/lib/api/public-response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { rtos } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/rtos/[slug] — Get RTO by slug
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const at = parseAtParam(new URL(req.url).searchParams);
  const db = getDb();
  const [rto] = await db.select().from(rtos).where(eq(rtos.slug, slug)).limit(1);

  if (!rto) {
    throw new ApiError("NOT_FOUND", `RTO '${slug}' not found`);
  }

  if (at) {
    return pointInTimeJsonResponse({
      entityType: "rto",
      entityId: rto.id,
      at,
      label: "RTO",
      slug,
      headers: { "Cache-Tag": `rto:${slug}` },
    });
  }

  return publicJsonResponse(rto, 200);
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
