/**
 * Field Moderation State helpers.
 *
 * `field_moderation_state` is the durable ledger that protects human-approved
 * field values from automated sync overwrites. These helpers are the only
 * write paths into that ledger; automated sync code must NEVER call
 * `releaseFieldModerationState`.
 */

import { and, eq } from "drizzle-orm";
import { fieldModerationState } from "@/lib/db/schema";
import type { DbTransaction } from "./apply-contribution";

export type VerificationType = "moderator" | "auto_approved";
export type ModerationStatus = "active" | "released";

export interface UpsertFieldModerationStateInput {
  entityType: string;
  entityId: string;
  fieldName: string;
  approvedValue: unknown;
  verificationType: VerificationType;
  contributionId: string | null;
  reviewedBy: string | null;
  sourceCitationId: string | null;
  now?: Date;
}

export interface ReleaseFieldModerationStateInput {
  entityType: string;
  entityId: string;
  fieldName: string;
  releasedBy: string;
  releaseReason: string;
  now?: Date;
}

/**
 * Establish or refresh protection for a human-approved field value.
 *
 * Re-approval of an already-protected field resets the row to active and
 * updates the approved value / provenance. Approving an unchanged value
 * creates an active row so protection is explicit, not inferred from deltas.
 */
export async function upsertFieldModerationState(
  tx: DbTransaction,
  input: UpsertFieldModerationStateInput
): Promise<void> {
  const now = input.now ?? new Date();
  await tx
    .insert(fieldModerationState)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
      approvedValue: input.approvedValue,
      status: "active",
      verificationType: input.verificationType,
      contributionId: input.contributionId,
      reviewedBy: input.reviewedBy,
      sourceCitationId: input.sourceCitationId,
      verifiedAt: now,
      releasedAt: null,
      releasedBy: null,
      releaseReason: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [fieldModerationState.entityType, fieldModerationState.entityId, fieldModerationState.fieldName],
      set: {
        approvedValue: input.approvedValue,
        status: "active",
        verificationType: input.verificationType,
        contributionId: input.contributionId,
        reviewedBy: input.reviewedBy,
        sourceCitationId: input.sourceCitationId,
        verifiedAt: now,
        releasedAt: null,
        releasedBy: null,
        releaseReason: null,
        updatedAt: now,
      },
    });
}

/**
 * Release protection on a field. Only callable from an authorized human
 * decision path — automated sync must never release a human lock.
 */
export async function releaseFieldModerationState(
  tx: DbTransaction,
  input: ReleaseFieldModerationStateInput
): Promise<void> {
  const now = input.now ?? new Date();
  await tx
    .update(fieldModerationState)
    .set({
      status: "released",
      releasedAt: now,
      releasedBy: input.releasedBy,
      releaseReason: input.releaseReason,
      updatedAt: now,
    })
    .where(
      and(
        eq(fieldModerationState.entityType, input.entityType),
        eq(fieldModerationState.entityId, input.entityId),
        eq(fieldModerationState.fieldName, input.fieldName),
        eq(fieldModerationState.status, "active")
      )
    );
}

/**
 * Return the set of field names that have an ACTIVE moderation-state row.
 *
 * This is additive to the last-writer inference in entity_versions: a field
 * with an active ledger row is protected regardless of what versions say.
 */
export async function getModerationLockedFields(
  tx: Pick<DbTransaction, "select">,
  entityType: string,
  entityId: string
): Promise<Set<string>> {
  const rows = await tx
    .select({ fieldName: fieldModerationState.fieldName })
    .from(fieldModerationState)
    .where(
      and(
        eq(fieldModerationState.entityType, entityType),
        eq(fieldModerationState.entityId, entityId),
        eq(fieldModerationState.status, "active")
      )
    );

  return new Set(rows.map((r) => r.fieldName));
}
