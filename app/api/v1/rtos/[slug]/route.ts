import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { rtos } from "@/lib/db/schema";
import { getDataSource } from "@/lib/feature-flags";

// ---------------------------------------------------------------------------
// GET /api/v1/rtos/[slug] — Get RTO by slug
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const source = getDataSource("rtos");

  if (source === "json") {
    const allRtos = (await import("@/data/rtos.json")).default;
    const rto = allRtos.find((r: { slug: string }) => r.slug === slug);
    if (!rto) {
      throw new ApiError("NOT_FOUND", `RTO '${slug}' not found`);
    }
    return jsonResponse({ data: rto }, 200, corsHeaders());
  }

  // Database mode
  const db = getDb();
  const [rto] = await db.select().from(rtos).where(eq(rtos.slug, slug)).limit(1);

  if (!rto) {
    throw new ApiError("NOT_FOUND", `RTO '${slug}' not found`);
  }

  return jsonResponse({ data: rto }, 200, corsHeaders());
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
