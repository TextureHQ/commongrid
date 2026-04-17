/**
 * GET   /api/v1/notifications/preferences — Get notification preferences
 * PATCH /api/v1/notifications/preferences — Update notification preferences
 *
 * Both require auth. If no preferences row exists, one is created with
 * defaults on first access (upsert).
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
import { userNotificationPrefs } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Valid delivery values
// ---------------------------------------------------------------------------

const VALID_DELIVERY = ["email_immediate", "email_daily", "in_app", "off"] as const;
type DeliveryPreference = (typeof VALID_DELIVERY)[number];

// ---------------------------------------------------------------------------
// Ensure preferences row exists (upsert with defaults)
// ---------------------------------------------------------------------------

async function ensurePreferences(userId: string) {
  const db = getDb();

  // Try to fetch existing
  const [existing] = await db
    .select()
    .from(userNotificationPrefs)
    .where(eq(userNotificationPrefs.userId, userId))
    .limit(1);

  if (existing) return existing;

  // Create with defaults
  const [created] = await db.insert(userNotificationPrefs).values({ userId }).onConflictDoNothing().returning();

  // If onConflictDoNothing returned nothing (race condition), re-fetch
  if (!created) {
    const [refetched] = await db
      .select()
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, userId))
      .limit(1);
    return refetched;
  }

  return created;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const prefs = await ensurePreferences(user.id);

  return jsonResponse({ data: prefs }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// PATCH handler
// ---------------------------------------------------------------------------

function validateDelivery(value: unknown, field: string): DeliveryPreference {
  if (typeof value !== "string" || !VALID_DELIVERY.includes(value as DeliveryPreference)) {
    throw new ApiError("VALIDATION_ERROR", `${field} must be one of: ${VALID_DELIVERY.join(", ")}`, { field });
  }
  return value as DeliveryPreference;
}

async function handlePatch(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();

  // Ensure row exists
  await ensurePreferences(user.id);

  const body = await req.json();
  const {
    contribution_status_delivery,
    followed_changes_delivery,
    discussion_activity_delivery,
    appeal_resolved_delivery,
    email_paused,
    digest_hour,
  } = body;

  // Build updates
  const updates: Record<string, unknown> = {};

  if (contribution_status_delivery !== undefined) {
    updates.contributionStatusDelivery = validateDelivery(contribution_status_delivery, "contribution_status_delivery");
  }

  if (followed_changes_delivery !== undefined) {
    updates.followedChangesDelivery = validateDelivery(followed_changes_delivery, "followed_changes_delivery");
  }

  if (discussion_activity_delivery !== undefined) {
    updates.discussionActivityDelivery = validateDelivery(discussion_activity_delivery, "discussion_activity_delivery");
  }

  if (appeal_resolved_delivery !== undefined) {
    updates.appealResolvedDelivery = validateDelivery(appeal_resolved_delivery, "appeal_resolved_delivery");
  }

  if (email_paused !== undefined) {
    if (typeof email_paused !== "boolean") {
      throw new ApiError("VALIDATION_ERROR", "email_paused must be a boolean.", { field: "email_paused" });
    }
    updates.emailPaused = email_paused;
  }

  if (digest_hour !== undefined) {
    if (digest_hour !== null && (typeof digest_hour !== "number" || digest_hour < 0 || digest_hour > 23)) {
      throw new ApiError("VALIDATION_ERROR", "digest_hour must be null or an integer between 0 and 23.", {
        field: "digest_hour",
      });
    }
    updates.digestHour = digest_hour;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError("VALIDATION_ERROR", "At least one preference field must be provided.");
  }

  updates.updatedAt = new Date();

  const db = getDb();
  const [updated] = await db
    .update(userNotificationPrefs)
    .set(updates)
    .where(eq(userNotificationPrefs.userId, user.id))
    .returning();

  return jsonResponse({ data: updated }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const patchHandler = withRequestId(withErrorHandling(withTiming(handlePatch)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}

export async function PATCH(req: NextRequest) {
  return patchHandler(req, { requestId: generateRequestId() });
}
