/**
 * POST /api/v1/discussions/:id/posts — Add a post to a thread
 *
 * Requires auth. Creates a post and updates the thread's post_count
 * and last_post_at. Sends notifications to thread followers and entity followers.
 *
 * See docs/specs/community-contributions-api-erd.md §6 Discussions
 */

import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { discussionPosts, discussionThreads } from "@/lib/db/schema";
import { createNotifications } from "@/lib/notifications/create-notification";
import { notifyEntityFollowers } from "@/lib/notifications/notify-followers";

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  const threadId = ctx.params?.id;
  if (!threadId) {
    throw new ApiError("BAD_REQUEST", "Thread ID is required.");
  }

  const user = await requireCurrentUser();

  // Check ban
  if (user.bannedAt) {
    const now = new Date();
    if (!user.bannedUntil || user.bannedUntil > now) {
      throw new ApiError("FORBIDDEN", "Your account is currently suspended.");
    }
  }

  const body = await req.json();
  const { body: postBody, reply_to_id } = body;

  // Validation
  if (!postBody || typeof postBody !== "string" || postBody.trim().length < 1) {
    throw new ApiError("VALIDATION_ERROR", "body is required.", { field: "body" });
  }

  const db = getDb();

  // Check thread exists and is open
  const [thread] = await db.select().from(discussionThreads).where(eq(discussionThreads.id, threadId)).limit(1);

  if (!thread) {
    throw new ApiError("NOT_FOUND", `Discussion thread ${threadId} not found.`);
  }

  if (thread.status === "closed") {
    throw new ApiError("FORBIDDEN", "Cannot post to a closed thread.");
  }

  // Validate reply_to_id if provided
  if (reply_to_id) {
    const [replyTarget] = await db
      .select({ id: discussionPosts.id, threadId: discussionPosts.threadId })
      .from(discussionPosts)
      .where(eq(discussionPosts.id, reply_to_id))
      .limit(1);

    if (!replyTarget) {
      throw new ApiError("NOT_FOUND", `Reply target post ${reply_to_id} not found.`);
    }

    if (replyTarget.threadId !== threadId) {
      throw new ApiError("VALIDATION_ERROR", "reply_to_id must reference a post in the same thread.", {
        field: "reply_to_id",
      });
    }
  }

  const now = new Date();

  // Create the post
  const [post] = await db
    .insert(discussionPosts)
    .values({
      threadId,
      userId: user.id,
      body: postBody.trim(),
      replyToId: reply_to_id ?? null,
    })
    .returning();

  // Update thread counters
  await db
    .update(discussionThreads)
    .set({
      postCount: sql`${discussionThreads.postCount} + 1`,
      lastPostAt: now,
    })
    .where(eq(discussionThreads.id, threadId));

  // --- Notifications (fire-and-forget, don't block the response) ---
  const notificationTitle = `New reply in "${thread.title}"`;
  const notificationBody = postBody.trim().length > 200 ? `${postBody.trim().slice(0, 200)}…` : postBody.trim();
  const notificationUrl = `/discussions/${threadId}#post-${post.id}`;

  // Notify the thread creator if they're not the poster
  const threadParticipantIds: string[] = [];
  if (thread.createdBy && thread.createdBy !== user.id) {
    threadParticipantIds.push(thread.createdBy);
  }

  // Notify unique post authors in the thread (except the current poster and thread creator)
  const existingAuthors = await db
    .select({ userId: discussionPosts.userId })
    .from(discussionPosts)
    .where(eq(discussionPosts.threadId, threadId))
    .groupBy(discussionPosts.userId);

  for (const author of existingAuthors) {
    if (author.userId && author.userId !== user.id && !threadParticipantIds.includes(author.userId)) {
      threadParticipantIds.push(author.userId);
    }
  }

  if (threadParticipantIds.length > 0) {
    createNotifications(threadParticipantIds, {
      type: "discussion_reply",
      refType: "discussion",
      refId: threadId,
      title: notificationTitle,
      body: notificationBody,
      url: notificationUrl,
      data: {
        thread_id: threadId,
        post_id: post.id,
        poster_name: user.displayName,
      },
    }).catch((err) => console.error("Failed to create thread participant notifications:", err));
  }

  // Notify entity followers with notify_discussions=true
  notifyEntityFollowers(
    thread.entityType,
    thread.entityId,
    "discussion_activity",
    {
      type: "discussion_reply",
      refType: "discussion",
      refId: threadId,
      title: notificationTitle,
      body: notificationBody,
      url: notificationUrl,
      data: {
        thread_id: threadId,
        post_id: post.id,
        poster_name: user.displayName,
        entity_type: thread.entityType,
        entity_id: thread.entityId,
      },
    },
    // Exclude the poster + already-notified thread participants
    [user.id, ...threadParticipantIds]
  ).catch((err) => console.error("Failed to notify entity followers:", err));

  return jsonResponse(
    {
      data: {
        ...post,
        author: {
          display_name: user.displayName,
          avatar_url: user.avatarUrl,
        },
      },
    },
    201,
    { ...corsHeaders(), "X-Request-Id": ctx.requestId }
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return postHandler(req, { requestId: generateRequestId(), params: { id } });
}
