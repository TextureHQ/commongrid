import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { isos } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET /api/v1/isos/[slug] — Get ISO by slug
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) {
    throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  }

  const db = getDb();
  const [iso] = await db.select().from(isos).where(eq(isos.slug, slug)).limit(1);

  if (!iso) {
    throw new ApiError("NOT_FOUND", `ISO '${slug}' not found`);
  }

  return jsonResponse({ data: iso }, 200, corsHeaders());
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { params: { slug }, requestId: generateRequestId() });
}
