/**
 * Auto-Approval Rules for Community Contributions
 *
 * Eligibility:
 * - update: `trusted_contributor`, `moderator` or `admin`, and every edited
 *   field must be non-critical and known in `community_editable_fields`
 * - create: `moderator` or `admin`
 * - delete: `admin` only (destructive)
 *
 * The field-criticality condition applies to `update` only, and deliberately so.
 * Criticality marks fields that are risky to *change* on an entity the registry
 * already publishes — renaming a utility, flipping a program's status. On a
 * create there is no prior value to protect, and the same fields are mandatory:
 * every new program necessarily sets `name` and `status`, both of which are
 * marked critical. Applying the condition to creates therefore rejected every
 * one of them regardless of role, so `create: moderator or admin` above could
 * never actually be satisfied.
 *
 * An eligible contribution is APPLIED here, through the same
 * `applyContribution` path a moderator approval uses. This previously only set
 * `status = 'auto_approved'` and incremented the contributor's stats without
 * touching the entity or writing an `entity_versions` row, so auto-approved
 * edits were accepted and then silently discarded.
 *
 * See ERD §3.14 (community_editable_fields) and §3.4 (contribution status).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getPooledDb } from "@/lib/db/client-pooled";
import { communityEditableFields, moderationActions, users } from "@/lib/db/schema";
import type { UserSelect } from "@/lib/db/schema/users";
import {
  type ApplicableContribution,
  applyContribution,
  type ChangeType,
  markContributionApplied,
} from "@/lib/mod/apply-contribution";

/** Moderator id recorded for machine-made decisions. */
const SYSTEM_USER_ID = "system";

const AUTO_APPROVE_COMMENT = "Auto-approved: trusted contributor editing non-critical fields.";

export interface AutoApproveResult {
  autoApproved: boolean;
  reason?: string;
  appliedVersion?: number;
}

/**
 * Decide whether a contribution qualifies for auto-approval on role and field
 * criticality alone. Pure read — no writes.
 *
 * Exported for tests: this gating matrix is security-relevant and worth pinning
 * directly, without standing up the transactional apply path around it.
 */
export async function checkEligibility(
  user: UserSelect,
  entityType: string,
  changes: Record<string, unknown>,
  changeType: ChangeType
): Promise<{ eligible: boolean; reason?: string }> {
  if (changeType === "delete") {
    if (user.role !== "admin") {
      return { eligible: false, reason: "Deletions require admin approval" };
    }
  } else if (changeType === "create") {
    if (user.role !== "moderator" && user.role !== "admin") {
      return { eligible: false, reason: "Creates require moderator approval" };
    }
  } else if (user.role !== "trusted_contributor" && user.role !== "moderator" && user.role !== "admin") {
    return { eligible: false, reason: "User is not a trusted contributor" };
  }

  const editedFields = Object.keys(changes);
  if (editedFields.length === 0) {
    return { eligible: false, reason: "No fields in changes" };
  }

  // Creates and deletes are gated on role only (above). Updates must also
  // avoid critical or unknown fields so that trusted contributors cannot
  // quietly modify high-stakes data or fields the system does not recognize.
  if (changeType === "update") {
    const db = getDb();
    const fieldMeta = await db
      .select()
      .from(communityEditableFields)
      .where(eq(communityEditableFields.entityType, entityType));

    const criticalFields = new Set(
      fieldMeta.filter((f: { isCritical: boolean }) => f.isCritical).map((f: { fieldName: string }) => f.fieldName)
    );
    const editableFields = new Set(fieldMeta.map((f: { fieldName: string }) => f.fieldName));

    for (const field of editedFields) {
      if (criticalFields.has(field)) {
        return { eligible: false, reason: `Field '${field}' is marked as critical` };
      }
      if (!editableFields.has(field)) {
        // Unknown fields are treated as critical — a moderator must look.
        return { eligible: false, reason: `Field '${field}' is not in community_editable_fields` };
      }
    }
  }

  return { eligible: true };
}

/**
 * Check whether a contribution qualifies for auto-approval and, if so, apply it
 * atomically: entity write, `entity_versions` row, contribution status,
 * moderation audit record and contributor stats all land together or not at all.
 *
 * Declines (leaving the contribution pending for a human) when the entity has
 * moved on or vanished since the edit was drafted — an auto-approver should
 * never resolve a conflict it cannot reason about.
 */
export async function tryAutoApprove(
  user: UserSelect,
  contribution: ApplicableContribution,
  changeType: ChangeType
): Promise<AutoApproveResult> {
  const changes = (contribution.changes ?? {}) as Record<string, unknown>;

  const eligibility = await checkEligibility(user, contribution.entityType, changes, changeType);
  if (!eligibility.eligible) {
    return { autoApproved: false, reason: eligibility.reason };
  }

  const db = getPooledDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const outcome = await applyContribution(tx, contribution, {
      actorId: SYSTEM_USER_ID,
      sourceType: "community",
      changeType,
      now,
    });

    if (outcome.status === "unknown_fields") {
      return {
        autoApproved: false,
        reason: `Fields do not exist on ${contribution.entityType}: ${outcome.fields.join(", ")}`,
      };
    }
    if (outcome.status === "entity_missing") {
      return { autoApproved: false, reason: "Entity no longer exists" };
    }
    if (outcome.status === "version_conflict") {
      return {
        autoApproved: false,
        reason: `Entity has changed since this edit was drafted (entity v${outcome.entityVersion}, edit based on v${outcome.contributionVersion})`,
      };
    }

    await markContributionApplied(tx, contribution.id, {
      status: "auto_approved",
      appliedVersion: outcome.appliedVersion,
      reviewedBy: null,
      moderatorComment: AUTO_APPROVE_COMMENT,
      autoApproved: true,
      now,
    });

    await tx.insert(moderationActions).values({
      moderatorId: SYSTEM_USER_ID,
      actionType: "approve",
      targetType: "contribution",
      targetId: contribution.id,
      comment: AUTO_APPROVE_COMMENT,
      metadata: {
        auto: true,
        fields: Object.keys(changes),
        user_role: user.role,
        change_type: changeType,
        applied_version: outcome.appliedVersion,
      },
    });

    if (contribution.userId) {
      await tx
        .update(users)
        .set({ approvedCount: sql`${users.approvedCount} + 1`, updatedAt: now })
        .where(eq(users.id, contribution.userId));
    }

    return { autoApproved: true, appliedVersion: outcome.appliedVersion };
  });
}
