/**
 * DELETE /api/v1/discussions/:id/posts/:postId — Soft-delete a post
 *
 * The post author or a moderator/admin can soft-delete a post.
 * Sets deleted_at and deleted_by without removing the row.
 *
 * See docs/specs/community-contributions-api-erd.md §6 Discussions
 */

import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { discussionPosts } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Mod roles set
// ---------------------------------------------------------------------------

const MOD_ROLES = new Set(["moderator", "admin"]);

// ---------------------------------------------------------------------------
// DELETE handler
// ---------------------------------------------------------------------------

async function handleDelete(_req: Request, ctx: RouteContext) {
  const threadId = ctx.params?.id;
  const postId = ctx.params?.postId;

  if (!threadId || !postId) {
    throw new ApiError("BAD_REQUEST", "Thread ID and Post ID are required.");
  }

  const user = await requireCurrentUser();
  const db = getDb();

  // Fetch the post
  const [post] = await db
    .select()
    .from(discussionPosts)
    .where(and(eq(discussionPosts.id, postId), eq(discussionPosts.threadId, threadId)))
    .limit(1);

  if (!post) {
    throw new ApiError("NOT_FOUND", `Post ${postId} not found in thread ${threadId}.`);
  }

  if (post.deletedAt) {
    throw new ApiError("CONFLICT", "Post is already deleted.");
  }

  // Authorization: post author or mod/admin
  const isAuthor = post.userId === user.id;
  const isMod = MOD_ROLES.has(user.role);

  if (!isAuthor && !isMod) {
    throw new ApiError("FORBIDDEN", "You can only delete your own posts.");
  }

  const now = new Date();

  // Soft-delete: set deleted_at and deleted_by
  const [updated] = await db
    .update(discussionPosts)
    .set({
      deletedAt: now,
      deletedBy: user.id,
      updatedAt: now,
    })
    .where(eq(discussionPosts.id, postId))
    .returning();

  // Decrement thread post_count
  // Use a subquery to ensure we don't go below 0
  await db.execute(sql`UPDATE discussion_threads SET post_count = GREATEST(post_count - 1, 0) WHERE id = ${threadId}`);

  return jsonResponse({ data: { ...updated, body: "[deleted]" } }, 200, {
    ...corsHeaders(),
    "X-Request-Id": ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

import { sql } from "drizzle-orm";

const deleteHandler = withRequestId(withErrorHandling(withTiming(handleDelete)));

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  const { id, postId } = await params;
  return deleteHandler(req, {
    requestId: generateRequestId(),
    params: { id, postId },
  });
}
