/**
 * Knock Notifications — TypeScript Types
 *
 * Defines all types used across the Knock integration: workflow keys,
 * preference categories, user sync data, notification payloads, and
 * webhook event shapes.
 */

// ---------------------------------------------------------------------------
// Workflow Keys
// ---------------------------------------------------------------------------

/**
 * All Knock workflow keys registered in the Knock dashboard.
 * 14 workflows covering contributor, follower, moderator, and admin events.
 */
export type KnockWorkflowKey =
  // Contributor status notifications
  | "contribution-approved"
  | "contribution-returned"
  | "changes-requested"
  | "contribution-auto-approved"
  | "contribution-submitted"
  // Community notifications
  | "appeal-resolved"
  | "trusted-status-earned"
  | "entity-updated"
  | "entity-followed-update"
  | "discussion-activity"
  // Moderator queue alerts
  | "mod-new-contribution"
  | "mod-flagged-contribution"
  // Admin notifications
  | "admin-new-user"
  | "admin-user-moderation";

// ---------------------------------------------------------------------------
// Preference Categories
// ---------------------------------------------------------------------------

/**
 * Knock preference category keys — map to CommonGrid's delivery pref fields.
 */
export type KnockCategory =
  | "contribution_status"
  | "followed_changes"
  | "discussion_activity"
  | "appeal_resolved"
  | "moderation_queue"
  | "admin_alerts";

// ---------------------------------------------------------------------------
// User Sync
// ---------------------------------------------------------------------------

/**
 * Data synced to Knock when identifying a user.
 */
export interface KnockUserProperties {
  id: string;
  email?: string | null;
  name: string;
  /** Custom attributes stored on the Knock user object */
  custom?: {
    role: string;
    approvedCount: number;
    isModerator: boolean;
    emailPaused: boolean;
  };
}

// ---------------------------------------------------------------------------
// Workflow Notification Payloads
// ---------------------------------------------------------------------------

export interface ContributionNotificationData {
  contributionId: string;
  entityType: string;
  entitySlug: string;
  entityUrl: string;
  contributionUrl: string;
  moderatorComment?: string | null;
  /** Human-readable summary of the change */
  changeSummary?: string | null;
}

export interface EntityUpdateNotificationData {
  entityId: string;
  entityType: string;
  entitySlug: string;
  entityUrl: string;
  editSummary: string;
  contributorName?: string | null;
}

export interface DiscussionNotificationData {
  threadId: string;
  postId: string;
  entityType: string;
  entitySlug: string;
  threadUrl: string;
  postPreview: string;
  authorName: string;
}

export interface ModNewContributionData {
  contributionId: string;
  contributorId: string;
  contributorName: string;
  entityType: string;
  entitySlug: string;
  contributionUrl: string;
  changeType: "create" | "update" | "delete";
  fieldSummary?: string | null;
}

export interface AdminNewUserData {
  newUserId: string;
  newUserName: string;
  newUserEmail?: string | null;
  newUserRole: string;
  registeredAt: string;
}

export interface AdminUserModerationData {
  targetUserId: string;
  targetUserName: string;
  moderatorId: string;
  moderatorName: string;
  action: "ban" | "warn" | "unban" | "promote" | "demote";
  reason?: string | null;
}

// ---------------------------------------------------------------------------
// Webhook Events
// ---------------------------------------------------------------------------

/**
 * Knock webhook event types we handle for delivery status tracking.
 */
export type KnockWebhookEventType =
  | "message.delivered"
  | "message.bounced"
  | "message.undelivered"
  | "message.read"
  | "message.link_clicked"
  | "message.seen"
  | "message.archived";

export interface KnockWebhookPayload {
  id: string;
  type: KnockWebhookEventType;
  created_at: string;
  data: {
    /** Knock message ID */
    id: string;
    channel_id: string;
    workflow: string;
    workflow_run_id?: string;
    recipient?: {
      id: string;
      email?: string;
    };
    metadata?: Record<string, unknown>;
    /** Present on message.read, message.link_clicked, message.seen */
    read_at?: string;
    /** Present on message.bounced / message.undelivered */
    error?: string;
  };
}
