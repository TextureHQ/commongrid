/**
 * GET   /api/v1/contributions/:id — Get contribution detail
 * PATCH /api/v1/contributions/:id — Update own pending contribution
 *
 * See docs/specs/community-contributions-api-erd.md §3
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
import { contributions } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Allowed source types (same as in the main route)
// ---------------------------------------------------------------------------

const VALID_SOURCE_TYPES = [
  "eia_filing",
  "utility_website",
  "state_puc",
  "sec_filing",
  "ferc_filing",
  "news_article",
  "academic_paper",
  "government_db",
  "personal_observation",
  "other",
] as const;

// ---------------------------------------------------------------------------
// GET /api/v1/contributions/:id — Get contribution detail
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const id = ctx.params?.id;
  if (!id) {
    throw new ApiError("BAD_REQUEST", "Contribution ID is required.");
  }

  const db = getDb();
  const [contribution] = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);

  if (!contribution) {
    throw new ApiError("NOT_FOUND", `Contribution ${id} not found.`);
  }

  return jsonResponse({ data: contribution }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/contributions/:id — Update own pending contribution
// ---------------------------------------------------------------------------

async function handlePatch(req: Request, ctx: RouteContext) {
  const id = ctx.params?.id;
  if (!id) {
    throw new ApiError("BAD_REQUEST", "Contribution ID is required.");
  }

  const user = await requireCurrentUser();
  const db = getDb();

  // Fetch the contribution
  const [existing] = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);

  if (!existing) {
    throw new ApiError("NOT_FOUND", `Contribution ${id} not found.`);
  }

  // Only the owner can update their contribution
  if (existing.userId !== user.id) {
    throw new ApiError("FORBIDDEN", "You can only edit your own contributions.");
  }

  // Contributors can edit while pending (revisions before review) or
  // changes_requested (responding to moderator feedback). Editing a
  // changes_requested contribution resubmits it for review.
  const EDITABLE_STATUSES = ["pending", "changes_requested"] as const;
  if (!EDITABLE_STATUSES.includes(existing.status as (typeof EDITABLE_STATUSES)[number])) {
    throw new ApiError(
      "CONFLICT",
      `Cannot edit a contribution with status '${existing.status}'. Only ${EDITABLE_STATUSES.join(" or ")} contributions can be updated.`
    );
  }

  const body = await req.json();
  const { edit_summary, changes, source_type, source_url, source_date } = body;

  // Build update payload — only allow specific fields
  const updates: Record<string, unknown> = {};

  if (edit_summary !== undefined) {
    if (typeof edit_summary !== "string" || edit_summary.trim().length < 25) {
      throw new ApiError("VALIDATION_ERROR", "edit_summary must be at least 25 characters.", { field: "edit_summary" });
    }
    updates.editSummary = edit_summary.trim();
  }

  if (changes !== undefined) {
    if (typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length === 0) {
      throw new ApiError("VALIDATION_ERROR", "changes must be a non-empty object with field changes.", {
        field: "changes",
      });
    }
    // Normalize incoming changes to { field: { old, new } } shape, matching
    // the canonical format used by POST and the moderator review handler.
    // The flat { field: value } shape is what InlineFieldEdit sends; we
    // preserve the existing { old } from the prior contribution when present.
    const existingChanges = (existing.changes as Record<string, { old: unknown; new: unknown }>) ?? {};
    const normalized: Record<string, { old: unknown; new: unknown }> = {};
    for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "new" in (value as Record<string, unknown>)
      ) {
        normalized[key] = value as { old: unknown; new: unknown };
      } else {
        // Flat: keep the prior 'old' so reviewers still see what the original
        // value was at the time of the first submission.
        const priorOld = existingChanges[key]?.old ?? null;
        normalized[key] = { old: priorOld, new: value };
      }
    }
    updates.changes = normalized;
  }

  if (source_type !== undefined) {
    if (!VALID_SOURCE_TYPES.includes(source_type as (typeof VALID_SOURCE_TYPES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `source_type must be one of: ${VALID_SOURCE_TYPES.join(", ")}`, {
        field: "source_type",
      });
    }
    updates.sourceType = source_type;
  }

  if (source_url !== undefined) {
    updates.sourceUrl = source_url;
  }

  if (source_date !== undefined) {
    updates.sourceDate = source_date;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "At least one field must be provided for update. Allowed: edit_summary, changes, source_type, source_url, source_date."
    );
  }

  // If the contributor is editing a contribution that the moderator returned
  // for changes, treat the edit as a resubmission: bounce status back to
  // 'pending' and clear the prior review so the queue picks it up again.
  // The moderator_actions table preserves the audit trail.
  if (existing.status === "changes_requested") {
    updates.status = "pending";
    updates.moderatorComment = null;
    updates.reviewedBy = null;
    updates.reviewedAt = null;
  }

  // Set updatedAt
  updates.updatedAt = new Date();

  const [updated] = await db.update(contributions).set(updates).where(eq(contributions.id, id)).returning();

  return jsonResponse({ data: updated }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const patchHandler = withRequestId(withErrorHandling(withTiming(handlePatch)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getHandler(req, { requestId: generateRequestId(), params: { id } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return patchHandler(req, { requestId: generateRequestId(), params: { id } });
}
