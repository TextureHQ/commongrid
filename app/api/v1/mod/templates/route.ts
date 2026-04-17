/**
 * GET  /api/v1/mod/templates — List moderation response templates
 * POST /api/v1/mod/templates — Create a new moderation response template (admin only)
 *
 * Templates are pre-written responses for common moderation actions:
 * return reasons, change requests, welcome messages, etc.
 *
 * See docs/specs/community-contributions-api-erd.md §3.15
 */

import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { moderationResponseTemplates } from "@/lib/db/schema";
import { requireAdmin, requireModerator } from "@/lib/mod/require-moderator";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = ["return_reason", "changes_requested", "welcome"] as const;

// ---------------------------------------------------------------------------
// GET handler — List templates
// ---------------------------------------------------------------------------

async function handleGet(req: Request, ctx: RouteContext) {
  await requireModerator();

  const url = new URL(req.url);
  const db = getDb();
  const category = url.searchParams.get("category");

  let query = db.select().from(moderationResponseTemplates).orderBy(desc(moderationResponseTemplates.createdAt));

  if (category) {
    if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `category must be one of: ${VALID_CATEGORIES.join(", ")}`, {
        field: "category",
      });
    }
    query = query.where(eq(moderationResponseTemplates.category, category)) as typeof query;
  }

  const rows = await query;

  return jsonResponse({ data: rows }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// POST handler — Create template (admin only)
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  const admin = await requireAdmin();
  const body = await req.json();
  const { name, response_text, category, is_global } = body;

  // Validate required fields
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new ApiError("VALIDATION_ERROR", "name is required and must be a non-empty string.", { field: "name" });
  }

  if (!response_text || typeof response_text !== "string" || response_text.trim().length === 0) {
    throw new ApiError("VALIDATION_ERROR", "response_text is required and must be a non-empty string.", {
      field: "response_text",
    });
  }

  if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
    throw new ApiError("VALIDATION_ERROR", `category must be one of: ${VALID_CATEGORIES.join(", ")}`, {
      field: "category",
    });
  }

  const db = getDb();

  const [template] = await db
    .insert(moderationResponseTemplates)
    .values({
      name: name.trim(),
      responseText: response_text.trim(),
      category,
      createdBy: admin.id,
      isGlobal: is_global !== false, // default true
    })
    .returning();

  return jsonResponse({ data: template }, 201, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: generateRequestId() });
}
