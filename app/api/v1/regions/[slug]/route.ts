import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { getDb } from "@/lib/db/client";
import { regions } from "@/lib/db/schema";
import {
  withRequestId,
  withErrorHandling,
  withTiming,
  generateRequestId,
} from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import type { RouteContext } from "@/lib/api/types";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/v1/regions/[slug] — Get region by slug
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const source = getDataSource("regions");

  if (source === "json") {
    const allRegions = (await import("@/data/regions.json")).default;
    const region = allRegions.find(
      (r: { slug: string }) => r.slug === slug
    );
    if (!region) {
      throw new ApiError("NOT_FOUND", `Region '${slug}' not found`);
    }
    return jsonResponse({ data: region }, 200, corsHeaders());
  }

  // Database mode
  const db = getDb();
  const [region] = await db
    .select()
    .from(regions)
    .where(eq(regions.slug, slug))
    .limit(1);

  if (!region) {
    throw new ApiError("NOT_FOUND", `Region '${slug}' not found`);
  }

  return jsonResponse({ data: region }, 200, corsHeaders());
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
