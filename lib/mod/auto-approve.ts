/**
 * Auto-Approval Rules for Community Contributions
 *
 * Logic:
 * - If contributor has `trusted_contributor` role AND all edited fields
 *   are non-critical in `community_editable_fields` → auto-approve.
 * - Sets `contributions.auto_approved = true`, `status = 'auto_approved'`.
 * - Logs a `moderation_actions` record with moderator_id as the system user.
 *
 * See ERD §3.14 for community_editable_fields and §3.4 for contribution status.
 */

import { eq } from "drizzle-orm";
import { communityEditableFields, contributions, moderationActions, users } from "@/lib/db/schema";
import type { UserSelect } from "@/lib/db/schema/users";

// System user ID for auto-approval audit trail
const SYSTEM_USER_ID = "system";

interface AutoApproveResult {
  autoApproved: boolean;
  reason?: string;
}

/**
 * Check whether a contribution qualifies for auto-approval and, if so,
 * apply it within the provided database transaction.
 *
 * @param db        - Drizzle database instance (may be a transaction)
 * @param user      - The contributing user
 * @param contributionId - ID of the contribution to check
 * @param entityType     - The entity type being edited
 * @param changes        - The changes JSONB (field_name → {old, new})
 */
export async function tryAutoApprove(
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle db/tx types are complex
  db: any,
  user: UserSelect,
  contributionId: string,
  entityType: string,
  changes: Record<string, unknown>
): Promise<AutoApproveResult> {
  // Only trusted_contributor role qualifies
  if (user.role !== "trusted_contributor") {
    return { autoApproved: false, reason: "User is not a trusted contributor" };
  }

  // Get the field names being edited
  const editedFields = Object.keys(changes);
  if (editedFields.length === 0) {
    return { autoApproved: false, reason: "No fields in changes" };
  }

  // Look up the community_editable_fields for this entity type
  const fieldMeta = await db
    .select()
    .from(communityEditableFields)
    .where(eq(communityEditableFields.entityType, entityType));

  // Build a set of critical field names
  const criticalFields = new Set(
    fieldMeta.filter((f: { isCritical: boolean }) => f.isCritical).map((f: { fieldName: string }) => f.fieldName)
  );

  // Build a set of known editable field names
  const editableFields = new Set(fieldMeta.map((f: { fieldName: string }) => f.fieldName));

  // Check if ANY edited field is critical or unknown (unknown = treat as critical)
  for (const field of editedFields) {
    if (criticalFields.has(field)) {
      return { autoApproved: false, reason: `Field '${field}' is marked as critical` };
    }
    if (!editableFields.has(field)) {
      // Unknown fields can't be auto-approved — need moderator review
      return { autoApproved: false, reason: `Field '${field}' is not in community_editable_fields` };
    }
  }

  // All fields are non-critical and known → auto-approve
  await db
    .update(contributions)
    .set({
      status: "auto_approved",
      autoApproved: true,
      reviewedAt: new Date(),
      moderatorComment: "Auto-approved: trusted contributor editing non-critical fields.",
      updatedAt: new Date(),
    })
    .where(eq(contributions.id, contributionId));

  // Log the moderation action
  await db.insert(moderationActions).values({
    moderatorId: SYSTEM_USER_ID,
    actionType: "approve",
    targetType: "contribution",
    targetId: contributionId,
    comment: "Auto-approved: trusted contributor editing non-critical fields.",
    metadata: {
      auto: true,
      fields: editedFields,
      user_role: user.role,
    },
  });

  // Update user stats
  await db
    .update(users)
    .set({
      approvedCount: user.approvedCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { autoApproved: true };
}
