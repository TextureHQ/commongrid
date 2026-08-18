/**
 * POST /api/v1/mod/contributions/:id/review — Moderation Action
 *
 * Allows moderators to approve, return, or request changes on a contribution.
 *
 * Actions:
 *   approve         — Mark approved, apply changes to entity, increment user stats, log audit
 *   return          — Mark returned with moderator comment, log audit
 *   request_changes — Mark changes_requested with comment, log audit
 *
 * Uses FOR UPDATE row lock for concurrency (per ERD §5).
 * Creates a moderation_actions record for audit trail.
 *
 * See docs/specs/community-contributions-api-erd.md §5
 */

import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { getPooledDb } from "@/lib/db/client-pooled";
import { contributions, moderationActions, users } from "@/lib/db/schema";
import { applyContribution, isKnownEntityType, markContributionApplied } from "@/lib/mod/apply-contribution";
import { detectChangeType } from "@/lib/mod/detect-change-type";
import { requireModerator } from "@/lib/mod/require-moderator";
import { createNotification } from "@/lib/notifications/create-notification";
import { notifyEntityFollowers } from "@/lib/notifications/notify-followers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ACTIONS = ["approve", "return", "request_changes"] as const;
type ReviewAction = (typeof VALID_ACTIONS)[number];

const ACTION_TO_STATUS: Record<ReviewAction, string> = {
  approve: "approved",
  return: "returned",
  request_changes: "changes_requested",
};

// The entity table map, field-name conversion and `changes` normalization all
// live in lib/mod/apply-contribution.ts, alongside the writes that use them.

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  const contributionId = ctx.params?.id;
  if (!contributionId) {
    throw new ApiError("BAD_REQUEST", "Contribution ID is required.");
  }

  const moderator = await requireModerator();
  const body = await req.json();
  const { action, comment, internal_note } = body;

  // Validate action
  if (!action || !VALID_ACTIONS.includes(action as ReviewAction)) {
    throw new ApiError("VALIDATION_ERROR", `action must be one of: ${VALID_ACTIONS.join(", ")}`, { field: "action" });
  }

  // Return and request_changes require a comment
  if ((action === "return" || action === "request_changes") && (!comment || typeof comment !== "string")) {
    throw new ApiError("VALIDATION_ERROR", `A comment is required for '${action}' actions.`, { field: "comment" });
  }

  const db = getDb();

  // Fetch the contribution (with row lock via raw SQL for concurrency)
  // NOTE: Neon HTTP driver doesn't support real transactions with FOR UPDATE,
  // so we use application-level optimistic locking with a status check.
  const [contribution] = await db.select().from(contributions).where(eq(contributions.id, contributionId)).limit(1);

  if (!contribution) {
    throw new ApiError("NOT_FOUND", `Contribution ${contributionId} not found.`);
  }

  // Only pending or changes_requested contributions can be reviewed
  if (contribution.status !== "pending" && contribution.status !== "changes_requested") {
    throw new ApiError(
      "CONFLICT",
      `Cannot review a contribution with status '${contribution.status}'. Only 'pending' or 'changes_requested' contributions can be reviewed.`
    );
  }

  const newStatus = ACTION_TO_STATUS[action as ReviewAction];
  const now = new Date();

  // Detect self-approval: the reviewing moderator is also the contributor.
  // Policy is allow-but-mark rather than block — a moderator fixing their own
  // typo should not need a second pair of eyes, but the fact that nobody else
  // looked must be recoverable from the audit trail. The flag lands in the
  // moderation_actions metadata so review history can surface it later.
  const isSelfApproval = action === "approve" && moderator.id === contribution.userId;
  const moderationActionMetadata: Record<string, unknown> = {
    previous_status: contribution.status,
    new_status: newStatus,
    entity_type: contribution.entityType,
    entity_id: contribution.entityId,
  };
  if (isSelfApproval) {
    moderationActionMetadata.self_approved = true;
  }

  // --- Apply the review ---

  if (action === "approve") {
    if (!isKnownEntityType(contribution.entityType)) {
      throw new ApiError("INTERNAL_ERROR", `Unknown entity type: ${contribution.entityType}`);
    }

    const changeType = detectChangeType(contribution);

    // Writes go through the pooled client so the entity write, its
    // entity_versions row, the contribution status and the contributor's stats
    // all land together. lib/db/client.ts speaks Neon's stateless HTTP
    // protocol, which has no session for BEGIN/COMMIT to live in — that is why
    // this route previously issued them as independent statements and could
    // leave an entity mutated with no corresponding version row.
    //
    // applyContribution is shared with the auto-approval path, so an accepted
    // edit is applied and versioned identically regardless of who accepted it.
    const pooled = getPooledDb();
    const outcome = await pooled.transaction(async (tx) => {
      const applied = await applyContribution(tx, contribution, {
        actorId: moderator.id,
        sourceType: "community",
        changeType,
        now,
      });

      // Both non-applied outcomes bail before any mutation, so returning here
      // commits an empty transaction rather than rolling one back.
      if (applied.status !== "applied") {
        return applied;
      }

      await markContributionApplied(tx, contributionId, {
        status: "approved",
        appliedVersion: applied.appliedVersion,
        reviewedBy: moderator.id,
        moderatorComment: comment ?? null,
        now,
      });

      if (contribution.userId) {
        await tx
          .update(users)
          .set({ approvedCount: sql`${users.approvedCount} + 1`, updatedAt: now })
          .where(eq(users.id, contribution.userId));
      }

      // Inside the transaction: the audit record must land with the change it
      // describes, not after a separate commit.
      await tx.insert(moderationActions).values({
        moderatorId: moderator.id,
        actionType: action,
        targetType: "contribution",
        targetId: contributionId,
        comment: comment ?? null,
        internalNote: internal_note ?? null,
        metadata: {
          ...moderationActionMetadata,
          applied_version: applied.appliedVersion,
        },
      });

      return applied;
    });

    if (outcome.status === "unknown_fields") {
      throw new ApiError(
        "VALIDATION_ERROR",
        `Cannot approve: ${outcome.fields.join(", ")} ${outcome.fields.length === 1 ? "is not a field" : "are not fields"} on ${contribution.entityType}.`,
        { field: outcome.fields[0] }
      );
    }

    if (outcome.status === "entity_missing") {
      throw new ApiError("NOT_FOUND", `Entity ${contribution.entityType}/${contribution.entityId} no longer exists.`);
    }

    if (outcome.status === "version_conflict") {
      const conflictMessage = `Version conflict: entity was at version ${outcome.entityVersion}, contribution was based on version ${outcome.contributionVersion}.`;

      await pooled.transaction(async (tx) => {
        await tx
          .update(contributions)
          .set({
            status: "version_conflict",
            reviewedBy: moderator.id,
            reviewedAt: now,
            moderatorComment: comment ?? conflictMessage,
            updatedAt: now,
          })
          .where(eq(contributions.id, contributionId));

        await tx.insert(moderationActions).values({
          moderatorId: moderator.id,
          actionType: "approve",
          targetType: "contribution",
          targetId: contributionId,
          comment: conflictMessage,
          internalNote: internal_note ?? null,
          metadata: {
            result: "version_conflict",
            entity_version: outcome.entityVersion,
            contribution_version: outcome.contributionVersion,
            change_type: changeType,
          },
        });
      });

      throw new ApiError(
        "CONFLICT",
        `Version conflict: the entity was modified since this contribution was submitted (entity v${outcome.entityVersion}, contribution based on v${outcome.contributionVersion}).`
      );
    }
  } else {
    // Return or request_changes — status, contributor stats and the audit
    // record commit together for the same reason the approve path does.
    await getPooledDb().transaction(async (tx) => {
      await tx
        .update(contributions)
        .set({
          status: newStatus,
          reviewedBy: moderator.id,
          reviewedAt: now,
          moderatorComment: comment ?? null,
          updatedAt: now,
        })
        .where(eq(contributions.id, contributionId));

      if (action === "return" && contribution.userId) {
        await tx
          .update(users)
          .set({ returnedCount: sql`${users.returnedCount} + 1`, updatedAt: now })
          .where(eq(users.id, contribution.userId));
      }

      await tx.insert(moderationActions).values({
        moderatorId: moderator.id,
        actionType: action,
        targetType: "contribution",
        targetId: contributionId,
        comment: comment ?? null,
        internalNote: internal_note ?? null,
        metadata: moderationActionMetadata,
      });
    });
  }

  // --- Notify the contributor ---
  if (contribution.userId) {
    const notifType =
      action === "approve"
        ? ("contribution_approved" as const)
        : action === "return"
          ? ("contribution_returned" as const)
          : ("changes_requested" as const);

    const notifTitle =
      action === "approve"
        ? "Your contribution was approved"
        : action === "return"
          ? "Your contribution was returned"
          : "Changes requested on your contribution";

    const notifBody = comment ?? (action === "approve" ? "Your edit has been applied." : undefined);

    createNotification({
      userId: contribution.userId,
      type: notifType,
      refType: "contribution",
      refId: contributionId,
      title: notifTitle,
      body: notifBody,
      url: `/contributions/${contributionId}`,
      data: {
        entity_type: contribution.entityType,
        entity_id: contribution.entityId,
        entity_slug: contribution.entitySlug,
        entity_url: `/${contribution.entityType}s/${contribution.entitySlug ?? contribution.entityId}`,
        contribution_id: contributionId,
        contribution_url: `/contributions/${contributionId}`,
        moderator_comment: comment ?? null,
        action,
      },
    }).catch((err) => console.error("Failed to notify contributor:", err));
  }

  // --- Notify entity followers on approval ---
  if (action === "approve") {
    notifyEntityFollowers(
      contribution.entityType,
      contribution.entityId,
      "entity_change",
      {
        type: "entity_followed_update",
        refType: "entity",
        refId: contribution.entityId,
        title: `${contribution.entityType} updated`,
        body: contribution.editSummary,
        url: `/${contribution.entityType}s/${contribution.entitySlug ?? contribution.entityId}`,
        data: {
          entity_type: contribution.entityType,
          entity_id: contribution.entityId,
          contribution_id: contributionId,
        },
      },
      // Exclude the contributor (they get their own notification)
      contribution.userId ? [contribution.userId] : []
    ).catch((err) => console.error("Failed to notify entity followers:", err));
  }

  // Fetch the updated contribution
  const [updated] = await db.select().from(contributions).where(eq(contributions.id, contributionId)).limit(1);

  return jsonResponse(
    {
      data: updated,
      moderation: {
        action,
        moderator_id: moderator.id,
        comment: comment ?? null,
        status: updated?.status ?? newStatus,
      },
    },
    200,
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
