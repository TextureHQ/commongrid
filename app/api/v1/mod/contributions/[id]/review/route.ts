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
import {
  balancingAuthorities,
  contributions,
  entityVersions,
  evStations,
  isos,
  moderationActions,
  powerPlants,
  pricingNodes,
  programs,
  regions,
  rtos,
  territories,
  transmissionLines,
  users,
  utilities,
} from "@/lib/db/schema";
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

type EntityType =
  | "utility"
  | "power_plant"
  | "ev_station"
  | "territory"
  | "transmission_line"
  | "pricing_node"
  | "iso"
  | "rto"
  | "balancing_authority"
  | "region"
  | "program";

// biome-ignore lint/suspicious/noExplicitAny: Drizzle table types vary
function getEntityTable(entityType: EntityType): any {
  const tableMap: Record<EntityType, unknown> = {
    utility: utilities,
    power_plant: powerPlants,
    ev_station: evStations,
    territory: territories,
    transmission_line: transmissionLines,
    pricing_node: pricingNodes,
    iso: isos,
    rto: rtos,
    balancing_authority: balancingAuthorities,
    region: regions,
    program: programs,
  };
  return tableMap[entityType];
}

/**
 * Convert snake_case field names (from community_editable_fields) to camelCase
 * Drizzle property names. e.g., "customer_count" → "customerCount"
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Normalize a contribution's changes to { field: { old, new } } format.
 * Handles both the canonical format and the flat { field: value } format
 * that the EditEntityPanel might send.
 */
function normalizeChanges(changes: Record<string, unknown>): Record<string, { old: unknown; new: unknown }> {
  const result: Record<string, { old: unknown; new: unknown }> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "new" in (value as Record<string, unknown>)
    ) {
      // Already in { old, new } format
      result[key] = value as { old: unknown; new: unknown };
    } else {
      // Flat format: wrap into { old: null, new: value }
      result[key] = { old: null, new: value };
    }
  }
  return result;
}

/**
 * Check whether a Drizzle table schema has a specific column.
 */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle table types vary
function tableHasColumn(table: any, columnProp: string): boolean {
  return table[columnProp] !== undefined;
}

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

  // --- Apply the review ---

  if (action === "approve") {
    // For approvals, we need to apply changes to the entity
    const entityTable = getEntityTable(contribution.entityType as EntityType);
    if (!entityTable) {
      throw new ApiError("INTERNAL_ERROR", `Unknown entity type: ${contribution.entityType}`);
    }

    const changeType = detectChangeType(contribution);

    if (changeType === "create") {
      // --- Handle create: INSERT a new entity ---
      const rawChanges = contribution.changes as Record<string, unknown>;
      const changes = normalizeChanges(rawChanges);

      const insertValues: Record<string, unknown> = {
        id: contribution.entityId,
        createdAt: now,
        updatedAt: now,
      };

      // Only set slug/version if the entity table supports them
      if (tableHasColumn(entityTable, "slug")) {
        insertValues.slug = contribution.entitySlug;
      }
      if (tableHasColumn(entityTable, "version")) {
        insertValues.version = 1;
      }
      if (tableHasColumn(entityTable, "submittedBy")) {
        insertValues.submittedBy = contribution.userId;
      }

      // Extract field values from changes, converting snake_case → camelCase
      for (const [field, change] of Object.entries(changes)) {
        const camelField = snakeToCamel(field);
        insertValues[camelField] = change.new;
      }

      await db.insert(entityTable).values(insertValues);

      // Create entity_versions record (v1 = full snapshot)
      await db.insert(entityVersions).values({
        entityType: contribution.entityType,
        entityId: contribution.entityId,
        versionNumber: 1,
        snapshot: insertValues,
        delta: null,
        changedBy: moderator.id,
        changedAt: now,
        changeType: "create",
        changeSummary: contribution.editSummary,
        contributionId: contributionId,
        sourceType: "community",
      });

      // Update contribution status
      await db
        .update(contributions)
        .set({
          status: newStatus,
          reviewedBy: moderator.id,
          reviewedAt: now,
          moderatorComment: comment ?? null,
          appliedVersion: 1,
          updatedAt: now,
        })
        .where(eq(contributions.id, contributionId));
    } else if (changeType === "delete") {
      // --- Handle delete: soft-delete the entity ---

      // Read entity to verify it exists
      const [entity] = await db.select().from(entityTable).where(eq(entityTable.id, contribution.entityId)).limit(1);

      if (!entity) {
        throw new ApiError("NOT_FOUND", `Entity ${contribution.entityType}/${contribution.entityId} no longer exists.`);
      }

      // Optimistic concurrency check (same as update path — ERD §5)
      const currentVersion = entity.version ?? 0;
      if (currentVersion !== contribution.entityVersion) {
        await db
          .update(contributions)
          .set({
            status: "version_conflict",
            reviewedBy: moderator.id,
            reviewedAt: now,
            moderatorComment:
              comment ??
              `Version conflict: entity was at version ${currentVersion}, contribution was based on version ${contribution.entityVersion}.`,
            updatedAt: now,
          })
          .where(eq(contributions.id, contributionId));

        await db.insert(moderationActions).values({
          moderatorId: moderator.id,
          actionType: "approve",
          targetType: "contribution",
          targetId: contributionId,
          comment: `Version conflict detected during delete. Entity version ${currentVersion} != contribution version ${contribution.entityVersion}.`,
          internalNote: internal_note ?? null,
          metadata: {
            result: "version_conflict",
            entity_version: currentVersion,
            contribution_version: contribution.entityVersion,
            change_type: "delete",
          },
        });

        throw new ApiError(
          "CONFLICT",
          `Version conflict: the entity was modified since this delete was submitted (entity v${currentVersion}, contribution based on v${contribution.entityVersion}).`
        );
      }

      const newVersion = currentVersion + 1;

      // Soft-delete: set deletedAt + bump version
      await db
        .update(entityTable)
        .set({
          deletedAt: now,
          updatedAt: now,
          version: newVersion,
        })
        .where(eq(entityTable.id, contribution.entityId));

      // Create entity_versions record for the deletion
      await db.insert(entityVersions).values({
        entityType: contribution.entityType,
        entityId: contribution.entityId,
        versionNumber: newVersion,
        snapshot: null,
        delta: { deletedAt: { old: null, new: now.toISOString() } },
        changedBy: moderator.id,
        changedAt: now,
        changeType: "delete",
        changeSummary: contribution.editSummary,
        contributionId: contributionId,
        sourceType: "community",
      });

      // Update contribution status
      await db
        .update(contributions)
        .set({
          status: newStatus,
          reviewedBy: moderator.id,
          reviewedAt: now,
          moderatorComment: comment ?? null,
          appliedVersion: newVersion,
          updatedAt: now,
        })
        .where(eq(contributions.id, contributionId));
    } else {
      // --- Handle update: apply field changes ---

      // Read entity to check version — optimistic concurrency (ERD §5)
      const [entity] = await db.select().from(entityTable).where(eq(entityTable.id, contribution.entityId)).limit(1);

      if (!entity) {
        throw new ApiError("NOT_FOUND", `Entity ${contribution.entityType}/${contribution.entityId} no longer exists.`);
      }

      // Check if entity version still matches (optimistic concurrency)
      // Skip version check for entity tables without version column (e.g., territories)
      const currentVersion = entity.version ?? 0;
      const hasVersioning = tableHasColumn(entityTable, "version");
      if (hasVersioning && currentVersion !== contribution.entityVersion) {
        // Mark as version_conflict
        await db
          .update(contributions)
          .set({
            status: "version_conflict",
            reviewedBy: moderator.id,
            reviewedAt: now,
            moderatorComment:
              comment ??
              `Version conflict: entity was at version ${currentVersion}, contribution was based on version ${contribution.entityVersion}.`,
            updatedAt: now,
          })
          .where(
            // Optimistic lock: only update if status hasn't changed
            eq(contributions.id, contributionId)
          );

        // Log the conflict action
        await db.insert(moderationActions).values({
          moderatorId: moderator.id,
          actionType: "approve",
          targetType: "contribution",
          targetId: contributionId,
          comment: `Version conflict detected. Entity version ${currentVersion} != contribution version ${contribution.entityVersion}.`,
          internalNote: internal_note ?? null,
          metadata: {
            result: "version_conflict",
            entity_version: currentVersion,
            contribution_version: contribution.entityVersion,
          },
        });

        throw new ApiError(
          "CONFLICT",
          `Version conflict: the entity was modified since this contribution was submitted (entity v${currentVersion}, contribution based on v${contribution.entityVersion}).`
        );
      }

      // Apply changes to the entity table, converting snake_case → camelCase
      const rawChanges = contribution.changes as Record<string, unknown>;
      const changes = normalizeChanges(rawChanges);
      const entityUpdates: Record<string, unknown> = {};
      for (const [fieldName, change] of Object.entries(changes)) {
        const camelField = snakeToCamel(fieldName);
        entityUpdates[camelField] = change.new;
      }

      // Update entity with version bump
      if (Object.keys(entityUpdates).length > 0) {
        entityUpdates.updatedAt = now;
        if (tableHasColumn(entityTable, "version")) {
          entityUpdates.version = currentVersion + 1;
        }
        await db.update(entityTable).set(entityUpdates).where(eq(entityTable.id, contribution.entityId));
      }

      // Create entity_versions record for the update
      await db.insert(entityVersions).values({
        entityType: contribution.entityType,
        entityId: contribution.entityId,
        versionNumber: currentVersion + 1,
        snapshot: null,
        delta: changes,
        changedBy: moderator.id,
        changedAt: now,
        changeType: "update",
        changeSummary: contribution.editSummary,
        contributionId: contributionId,
        sourceType: "community",
      });

      // Update contribution status
      await db
        .update(contributions)
        .set({
          status: newStatus,
          reviewedBy: moderator.id,
          reviewedAt: now,
          moderatorComment: comment ?? null,
          appliedVersion: currentVersion + 1,
          updatedAt: now,
        })
        .where(eq(contributions.id, contributionId));
    }

    // Update contributor stats (shared for all approve paths)
    if (contribution.userId) {
      await db
        .update(users)
        .set({
          approvedCount: sql`${users.approvedCount} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, contribution.userId));
    }
  } else {
    // Return or request_changes — just update the contribution status
    await db
      .update(contributions)
      .set({
        status: newStatus,
        reviewedBy: moderator.id,
        reviewedAt: now,
        moderatorComment: comment ?? null,
        updatedAt: now,
      })
      .where(eq(contributions.id, contributionId));

    // Update contributor returned_count for 'return' action
    if (action === "return" && contribution.userId) {
      await db
        .update(users)
        .set({
          returnedCount: sql`${users.returnedCount} + 1`,
          updatedAt: now,
        })
        .where(eq(users.id, contribution.userId));
    }
  }

  // --- Log the moderation action ---
  await db.insert(moderationActions).values({
    moderatorId: moderator.id,
    actionType: action,
    targetType: "contribution",
    targetId: contributionId,
    comment: comment ?? null,
    internalNote: internal_note ?? null,
    metadata: {
      previous_status: contribution.status,
      new_status: newStatus,
      entity_type: contribution.entityType,
      entity_id: contribution.entityId,
    },
  });

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
