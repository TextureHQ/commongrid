/**
 * PATCH /api/v1/notifications/:id/read — Mark a single notification as read
 *
 * Requires auth. The notification must belong to the current user.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Notifications
 */

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// PATCH handler
// ---------------------------------------------------------------------------

async function handlePatch(_req: Request, ctx: RouteContext) {
  const notificationId = ctx.params?.id;
  if (!notificationId) {
    throw new ApiError("BAD_REQUEST", "Notification ID is required.");
  }

  const user = await requireCurrentUser();
  const db = getDb();

  // Fetch the notification
  const [notification] = await db.select().from(notifications).where(eq(notifications.id, notificationId)).limit(1);

  if (!notification) {
    throw new ApiError("NOT_FOUND", `Notification ${notificationId} not found.`);
  }

  if (notification.userId !== user.id) {
    throw new ApiError("FORBIDDEN", "You can only mark your own notifications as read.");
  }

  if (notification.readAt) {
    // Already read — return as-is (idempotent)
    return jsonResponse({ data: notification }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
  }

  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, notificationId))
    .returning();

  return jsonResponse({ data: updated }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const patchHandler = withRequestId(withErrorHandling(withTiming(handlePatch)));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return patchHandler(req, { requestId: generateRequestId(), params: { id } });
}
