/**
 * Knock Workflow Triggers
 *
 * Typed functions for every Knock workflow in CommonGrid. All triggers are
 * fire-and-forget: errors are logged but never re-thrown so a Knock outage
 * cannot block the primary request path.
 *
 * cancellation_key is used for idempotency — Knock de-duplicates triggers
 * that share the same (workflow + cancellation_key) pair. An empty recipient
 * list short-circuits before hitting the network.
 */

import { getKnockClient, isKnockConfigured } from "./client";
import type {
  AdminNewUserData,
  AdminUserModerationData,
  ContributionNotificationData,
  DiscussionNotificationData,
  EntityUpdateNotificationData,
  KnockWorkflowKey,
  ModNewContributionData,
} from "./types";

// ---------------------------------------------------------------------------
// Generic helper
// ---------------------------------------------------------------------------

interface TriggerOptions {
  workflow: KnockWorkflowKey;
  recipients: string[];
  data: Record<string, unknown>;
  cancellationKey?: string;
  actor?: string;
}

/**
 * Generic workflow trigger. Returns the workflow_run_id or null when
 * Knock is unconfigured, the recipient list is empty, or an error occurs.
 */
export async function triggerWorkflow(opts: TriggerOptions): Promise<string | null> {
  if (!isKnockConfigured()) return null;
  if (opts.recipients.length === 0) return null;

  try {
    const knock = getKnockClient();
    const result = await knock.workflows.trigger(opts.workflow, {
      recipients: opts.recipients,
      data: opts.data,
      cancellation_key: opts.cancellationKey,
      actor: opts.actor ?? null,
    });
    return result.workflow_run_id ?? null;
  } catch (err) {
    console.error(`[knock] triggerWorkflow failed for workflow "${opts.workflow}":`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contributor status notifications
// ---------------------------------------------------------------------------

export async function triggerContributionApproved(
  recipientId: string,
  data: ContributionNotificationData,
  cancellationKey?: string
): Promise<string | null> {
  return triggerWorkflow({
    workflow: "contribution-approved",
    recipients: [recipientId],
    data: data as unknown as Record<string, unknown>,
    cancellationKey: cancellationKey ?? `contribution-approved:${data.contributionId}`,
  });
}

export async function triggerContributionReturned(
  recipientId: string,
  data: ContributionNotificationData,
  cancellationKey?: string
): Promise<string | null> {
  return triggerWorkflow({
    workflow: "contribution-returned",
    recipients: [recipientId],
    data: data as unknown as Record<string, unknown>,
    cancellationKey: cancellationKey ?? `contribution-returned:${data.contributionId}`,
  });
}

export async function triggerChangesRequested(
  recipientId: string,
  data: ContributionNotificationData,
  cancellationKey?: string
): Promise<string | null> {
  return triggerWorkflow({
    workflow: "changes-requested",
    recipients: [recipientId],
    data: data as unknown as Record<string, unknown>,
    cancellationKey: cancellationKey ?? `changes-requested:${data.contributionId}`,
  });
}

export async function triggerContributionAutoApproved(
  recipientId: string,
  data: ContributionNotificationData,
  cancellationKey?: string
): Promise<string | null> {
  return triggerWorkflow({
    workflow: "contribution-auto-approved",
    recipients: [recipientId],
    data: data as unknown as Record<string, unknown>,
    cancellationKey: cancellationKey ?? `contribution-auto-approved:${data.contributionId}`,
  });
}

export async function triggerContributionSubmitted(
  recipientId: string,
  data: ContributionNotificationData,
  cancellationKey?: string
): Promise<string | null> {
  return triggerWorkflow({
    workflow: "contribution-submitted",
    recipients: [recipientId],
    data: data as unknown as Record<string, unknown>,
    cancellationKey: cancellationKey ?? `contribution-submitted:${data.contributionId}`,
  });
}

export async function triggerAppealResolved(
  recipientId: string,
  data: {
    appealId: string;
    resolution: string;
    reason?: string | null;
    entityType: string;
    entitySlug: string;
  }
): Promise<string | null> {
  return triggerWorkflow({
    workflow: "appeal-resolved",
    recipients: [recipientId],
    data: data as unknown as Record<string, unknown>,
    cancellationKey: `appeal-resolved:${data.appealId}`,
  });
}

export async function triggerTrustedStatusEarned(recipientId: string): Promise<string | null> {
  return triggerWorkflow({
    workflow: "trusted-status-earned",
    recipients: [recipientId],
    data: {},
    cancellationKey: `trusted-status-earned:${recipientId}`,
  });
}

// ---------------------------------------------------------------------------
// Entity follower notifications (batch)
// ---------------------------------------------------------------------------

export async function triggerEntityUpdated(
  recipientIds: string[],
  data: EntityUpdateNotificationData
): Promise<string | null> {
  if (recipientIds.length === 0) return null;
  return triggerWorkflow({
    workflow: "entity-updated",
    recipients: recipientIds,
    data: data as unknown as Record<string, unknown>,
    cancellationKey: `entity-updated:${data.entityId}:${Date.now()}`,
  });
}

// ---------------------------------------------------------------------------
// Discussion notifications (batch)
// ---------------------------------------------------------------------------

export async function triggerDiscussionActivity(
  recipientIds: string[],
  data: DiscussionNotificationData
): Promise<string | null> {
  if (recipientIds.length === 0) return null;
  return triggerWorkflow({
    workflow: "discussion-activity",
    recipients: recipientIds,
    data: data as unknown as Record<string, unknown>,
    cancellationKey: `discussion-activity:${data.postId}`,
  });
}

// ---------------------------------------------------------------------------
// Moderator queue alerts (batch)
// ---------------------------------------------------------------------------

export async function triggerModNewContribution(
  moderatorIds: string[],
  data: ModNewContributionData,
  cancellationKey?: string
): Promise<string | null> {
  if (moderatorIds.length === 0) return null;
  return triggerWorkflow({
    workflow: "mod-new-contribution",
    recipients: moderatorIds,
    data: data as unknown as Record<string, unknown>,
    cancellationKey: cancellationKey ?? `mod-new-contribution:${data.contributionId}`,
  });
}

export async function triggerModFlaggedContribution(
  moderatorIds: string[],
  data: ModNewContributionData
): Promise<string | null> {
  if (moderatorIds.length === 0) return null;
  return triggerWorkflow({
    workflow: "mod-flagged-contribution",
    recipients: moderatorIds,
    data: data as unknown as Record<string, unknown>,
    cancellationKey: `mod-flagged-contribution:${data.contributionId}`,
  });
}

// ---------------------------------------------------------------------------
// Admin notifications (batch)
// ---------------------------------------------------------------------------

export async function triggerAdminNewUser(
  adminIds: string[],
  data: AdminNewUserData
): Promise<string | null> {
  if (adminIds.length === 0) return null;
  return triggerWorkflow({
    workflow: "admin-new-user",
    recipients: adminIds,
    data: data as unknown as Record<string, unknown>,
    cancellationKey: `admin-new-user:${data.newUserId}`,
  });
}

export async function triggerAdminUserModeration(
  adminIds: string[],
  data: AdminUserModerationData
): Promise<string | null> {
  if (adminIds.length === 0) return null;
  return triggerWorkflow({
    workflow: "admin-user-moderation",
    recipients: adminIds,
    data: data as unknown as Record<string, unknown>,
    cancellationKey: `admin-user-moderation:${data.targetUserId}:${data.action}:${Date.now()}`,
  });
}
