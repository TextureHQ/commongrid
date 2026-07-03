/**
 * POST /api/v1/notifications/read-all — Mark all notifications as read
 *
 * Requires auth. Marks all unread notifications for the current user as read.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Notifications
 */

import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

async function handlePost(_req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();

  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .returning();

  return jsonResponse({ data: { marked_read: updated.length } }, 200, {
    ...corsHeaders(),
    "X-Request-Id": ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: generateRequestId() });
}
