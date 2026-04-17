/**
 * DELETE /api/v1/follows/:id — Unfollow an entity
 * PATCH  /api/v1/follows/:id — Update notification preferences for a follow
 *
 * Both endpoints require auth and the follow must belong to the current user.
 *
 * See docs/specs/community-contributions-api-erd.md §7 Entity Follows
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
import { entityFollows } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Helper: fetch follow and verify ownership
// ---------------------------------------------------------------------------

async function getOwnedFollow(followId: string, userId: string) {
  const db = getDb();
  const [follow] = await db.select().from(entityFollows).where(eq(entityFollows.id, followId)).limit(1);

  if (!follow) {
    throw new ApiError("NOT_FOUND", `Follow ${followId} not found.`);
  }

  if (follow.userId !== userId) {
    throw new ApiError("FORBIDDEN", "You can only manage your own follows.");
  }

  return follow;
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/follows/:id — Unfollow
// ---------------------------------------------------------------------------

async function handleDelete(_req: Request, ctx: RouteContext) {
  const followId = ctx.params?.id;
  if (!followId) {
    throw new ApiError("BAD_REQUEST", "Follow ID is required.");
  }

  const user = await requireCurrentUser();
  await getOwnedFollow(followId, user.id);

  const db = getDb();
  await db.delete(entityFollows).where(eq(entityFollows.id, followId));

  return jsonResponse({ data: { id: followId, deleted: true } }, 200, {
    ...corsHeaders(),
    "X-Request-Id": ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/follows/:id — Update notification preferences
// ---------------------------------------------------------------------------

async function handlePatch(req: Request, ctx: RouteContext) {
  const followId = ctx.params?.id;
  if (!followId) {
    throw new ApiError("BAD_REQUEST", "Follow ID is required.");
  }

  const user = await requireCurrentUser();
  await getOwnedFollow(followId, user.id);

  const body = await req.json();
  const { notify_all_changes, notify_discussions } = body;

  // At least one field must be provided
  if (notify_all_changes === undefined && notify_discussions === undefined) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "At least one of notify_all_changes or notify_discussions must be provided."
    );
  }

  const updates: Record<string, boolean> = {};
  if (notify_all_changes !== undefined) {
    if (typeof notify_all_changes !== "boolean") {
      throw new ApiError("VALIDATION_ERROR", "notify_all_changes must be a boolean.", { field: "notify_all_changes" });
    }
    updates.notifyAllChanges = notify_all_changes;
  }
  if (notify_discussions !== undefined) {
    if (typeof notify_discussions !== "boolean") {
      throw new ApiError("VALIDATION_ERROR", "notify_discussions must be a boolean.", { field: "notify_discussions" });
    }
    updates.notifyDiscussions = notify_discussions;
  }

  const db = getDb();
  const [updated] = await db.update(entityFollows).set(updates).where(eq(entityFollows.id, followId)).returning();

  return jsonResponse({ data: updated }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const deleteHandler = withRequestId(withErrorHandling(withTiming(handleDelete)));
const patchHandler = withRequestId(withErrorHandling(withTiming(handlePatch)));

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteHandler(req, { requestId: generateRequestId(), params: { id } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return patchHandler(req, { requestId: generateRequestId(), params: { id } });
}
