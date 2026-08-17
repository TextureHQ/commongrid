import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withApiMiddleware } from "@/lib/api/middleware";
import { parseAtParam, pointInTimeJsonResponse } from "@/lib/api/point-in-time";
import { publicJsonResponse } from "@/lib/api/public-response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { balancingAuthorities } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/balancing-authorities/[slug] — Get BA by slug
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const at = parseAtParam(new URL(req.url).searchParams);
  const db = getDb();
  const [ba] = await db.select().from(balancingAuthorities).where(eq(balancingAuthorities.slug, slug)).limit(1);

  if (!ba) {
    throw new ApiError("NOT_FOUND", `Balancing authority '${slug}' not found`);
  }

  if (at) {
    return pointInTimeJsonResponse({
      entityType: "balancing_authority",
      entityId: ba.id,
      at,
      label: "Balancing authority",
      slug,
      headers: { "Cache-Tag": `balancing-authority:${slug}` },
    });
  }

  return publicJsonResponse(ba, 200);
}

const handler = withApiMiddleware(handleGet);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
