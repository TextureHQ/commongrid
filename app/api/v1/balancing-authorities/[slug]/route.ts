import { NextRequest } from "next/server";

import { getDataSource } from "@/lib/feature-flags";
import { getDb } from "@/lib/db/client";
import { balancingAuthorities } from "@/lib/db/schema";
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
// GET /api/v1/balancing-authorities/[slug] — Get BA by slug
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const source = getDataSource("balancingAuthorities");

  if (source === "json") {
    const allBAs = (await import("@/data/balancing-authorities.json")).default;
    const ba = allBAs.find((b: { slug: string }) => b.slug === slug);
    if (!ba) {
      throw new ApiError(
        "NOT_FOUND",
        `Balancing authority '${slug}' not found`
      );
    }
    return jsonResponse({ data: ba }, 200, corsHeaders());
  }

  // Database mode
  const db = getDb();
  const [ba] = await db
    .select()
    .from(balancingAuthorities)
    .where(eq(balancingAuthorities.slug, slug))
    .limit(1);

  if (!ba) {
    throw new ApiError(
      "NOT_FOUND",
      `Balancing authority '${slug}' not found`
    );
  }

  return jsonResponse({ data: ba }, 200, corsHeaders());
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
