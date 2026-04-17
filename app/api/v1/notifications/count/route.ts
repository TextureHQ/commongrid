/**
 * GET /api/v1/notifications/count — Unread notification count
 *
 * Lightweight endpoint for polling badge updates.
 * Requires auth.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Notifications
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  return jsonResponse({ data: { unread_count: Number(count) } }, 200, {
    ...corsHeaders(),
    "X-Request-Id": ctx.requestId,
    // Short cache for polling
    "Cache-Control": "private, max-age=10",
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}
