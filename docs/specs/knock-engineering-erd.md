# Knock Notifications Integration — Engineering ERD & Architecture

**Document Version:** 1.0  
**Date Created:** 2026-04-21  
**Task ID:** LDR-97 (Linear)  
**Status:** Technical specification for implementation

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    CommonGrid API (Next.js)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Moderation      │  │ Contribution     │  │  Follower    │  │
│  │  Review Handler  │  │  Creation API    │  │  System      │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────┘  │
│           │                     │                     │          │
│           └─────────┬───────────┴─────────────────────┘          │
│                     ↓                                             │
│            ┌─────────────────────┐                               │
│            │ Database            │                               │
│            │ (Postgres Neon)     │                               │
│            │                     │                               │
│            │ • notifications     │                               │
│            │ • user_notification │                               │
│            │   _prefs            │                               │
│            │ • contributions     │                               │
│            │ • users             │                               │
│            │ • entity_follows    │                               │
│            └────────────┬────────┘                               │
│                         │                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │
                          ↓
              ┌───────────────────────┐
              │   Knock Notification  │
              │   Platform (Cloud)    │
              │                       │
              │ • Templates           │
              │ • Channel             │
              │   Orchestration       │
              │ • Batching/Digests    │
              │ • User Preferences    │
              │ • Delivery Status     │
              └───────────┬───────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
   ┌─────────┐       ┌─────────┐      ┌─────────┐
   │  Email  │       │ Webhook │      │   SMS   │
   │ Service │       │ Events  │      │(Phase 2)│
   │(SendGrid)       │         │      └─────────┘
   └─────────┘       └────┬────┘
                          │
                          ↓
                  ┌──────────────────┐
                  │ Webhook Handler  │
                  │ /api/webhooks/   │
                  │   knock/...      │
                  └────────┬─────────┘
                           │
                           ↓
                  ┌──────────────────┐
                  │ Update DB Status  │
                  │ (email_status,    │
                  │ email_service_id) │
                  └──────────────────┘
```

---

## 2. Data Model — ERD

### 2.1 Notifications Table (Enhanced)

```
notifications (existing, no structural changes)
├─ id: UUID (PK) ←─┐
├─ user_id: UUID (FK→users) ├─ Polymorphic receiver
├─ type: TEXT (enum) ├─ Notification type
├─ ref_type: TEXT ├─ Reference type
├─ ref_id: UUID ├─ Reference ID
├─ title: TEXT (for display)
├─ body: TEXT (preview)
├─ url: TEXT (action link)
├─ data: JSONB (template vars)
├─ read_at: TIMESTAMP (in-app read)
├─ email_type: TEXT ├─ 'immediate' | 'daily_digest'
├─ email_status: TEXT ├─ 'pending' | 'sent' | 'bounced' | 'failed'
├─ email_service_id: TEXT ├─ Knock message ID
├─ delivery_attempts: INT (retry counter)
└─ created_at: TIMESTAMP

Indexes:
├─ (user_id, created_at DESC) — Fetch user notifications
├─ (email_status, created_at) WHERE email_type IS NOT NULL — Retry scan
└─ (email_service_id) — Webhook lookup (sparse)

UNIQUE: None (same user can have multiple notifications)
```

### 2.2 User Notification Prefs Table (Existing)

```
user_notification_prefs (existing, no changes)
├─ user_id: TEXT (PK, FK→users)
├─ contribution_status_delivery: TEXT
│  └─ 'email_immediate' | 'email_daily' | 'in_app' | 'off'
├─ followed_changes_delivery: TEXT
│  └─ 'email_immediate' | 'email_daily' | 'in_app' | 'off'
├─ discussion_activity_delivery: TEXT
│  └─ 'email_daily' | 'in_app' | 'off'
├─ appeal_resolved_delivery: TEXT
│  └─ 'email_immediate' | 'in_app' | 'off'
├─ email_paused: BOOLEAN (global opt-out)
├─ digest_hour: INT (0–23 UTC)
└─ updated_at: TIMESTAMP
```

### 2.3 Knock User Sync (Conceptual)

**Not stored in DB** — synced via API on user create/update:

```
Knock User Record (in Knock backend)
├─ id: user_id (from CommonGrid)
├─ email: user.email
├─ name: user.name
├─ custom_attributes:
│  ├─ role: 'contributor' | 'moderator'
│  ├─ approved_count: INT
│  ├─ is_moderator: BOOLEAN
│  └─ preferences: {
│      ├─ contribution_status: 'immediate' | 'daily'
│      ├─ followed_changes: 'immediate' | 'daily'
│      └─ email_paused: BOOLEAN
│     }
└─ preferences: (Knock-native, via API)
   ├─ channel_types: ['email']
   └─ unsubscribe_list: [notification_types]
```

### 2.4 Relationships

```
users (1) ──→ (∞) notifications
  │            └─ Who gets notified
  │
  └──→ (1) user_notification_prefs
       └─ Their preference settings

contributions (1) ──→ (∞) notifications
  └─ refType='contribution' notifications
  
entity_follows (∞) ──→ (∞) notifications
  └─ Users following entity get update notifications
  
users (many, moderators) ──→ (no direct link, role-based)
  └─ Moderators get "contribution_submitted" notifications
```

---

## 3. Component Specifications

### 3.1 Knock Client (`lib/knock-client.ts`)

```typescript
/**
 * Knock API wrapper for CommonGrid
 * 
 * Handles:
 * - Authentication (API key from env)
 * - User sync (create/update users in Knock)
 * - Notification sending
 * - Request retries with exponential backoff
 * - Error handling & logging
 */

interface KnockConfig {
  apiKey: string;
  workspaceId?: string;
  apiUrl: string; // https://api.knock.app
  timeout: number;
}

class KnockClient {
  constructor(config: KnockConfig)
  
  // User Management
  async syncUser(userId: string, userData: {
    email: string;
    name: string;
    custom_attributes?: Record<string, unknown>;
  }): Promise<{ id: string }>
  
  async setUserPreferences(userId: string, prefs: {
    channels: string[];  // ['email']
    subscriptions: Record<string, boolean>;
  }): Promise<void>

  // Notification Sending
  async sendNotification(params: {
    recipientId: string;  // user.id
    templateId: string;   // 'contribution_approved'
    data: Record<string, unknown>;  // template variables
    idempotencyKey?: string;  // notification.id for dedup
    channels?: string[];  // Override: ['email']
    delays?: { email: { minutes: number } };  // For digest batching
  }): Promise<{
    message_id: string;
    status: 'queued' | 'sent';
  }>

  // Batch Operations
  async sendBulkNotification(params: {
    recipientIds: string[];
    templateId: string;
    data: Record<string, unknown>;
  }): Promise<{ messages: Array<{ id: string; user_id: string }> }>

  // Internal
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries?: number
  ): Promise<T>
  
  private validateResponse(response: unknown): unknown
}

// Singleton
export const knockClient = new KnockClient({
  apiKey: process.env.KNOCK_API_KEY!,
  apiUrl: 'https://api.knock.app',
  timeout: 10000,
});
```

### 3.2 Send Knock Notification Function (`lib/notifications/send-knock.ts`)

```typescript
/**
 * High-level function to send a notification via Knock
 * 
 * Respects user preferences, handles retries, updates DB
 */

interface SendKnockParams {
  notificationId: string;  // DB notification.id
  recipientId: string;     // user.id
  templateId: string;      // 'contribution_approved'
  data: Record<string, unknown>;  // template variables
  deliveryPreference?: 'immediate' | 'daily_digest';
  userEmail?: string;      // To update user in Knock
}

export async function sendKnockNotification(
  params: SendKnockParams
): Promise<{ success: boolean; knockMessageId?: string; error?: string }> {
  try {
    // 1. Sync user (ensures user exists in Knock)
    await knockClient.syncUser(params.recipientId, {
      email: params.userEmail || '',
      // ... other fields
    });

    // 2. Determine delivery channels based on preference
    const channels = getChannelsForPreference(params.deliveryPreference);

    // 3. Add delay if daily digest
    const delays = params.deliveryPreference === 'daily_digest'
      ? { email: { minutes: 1440 } }  // 24h delay, let Knock batch
      : undefined;

    // 4. Send via Knock
    const response = await knockClient.sendNotification({
      recipientId: params.recipientId,
      templateId: params.templateId,
      data: params.data,
      idempotencyKey: params.notificationId,  // Knock dedupes
      channels,
      delays,
    });

    // 5. Update DB with Knock message ID
    await updateNotificationKnockStatus(params.notificationId, {
      emailServiceId: response.message_id,
      emailStatus: 'pending',  // Waiting for webhook callback
    });

    return { success: true, knockMessageId: response.message_id };
  } catch (error) {
    // Log, mark for retry
    console.error('Failed to send notification via Knock:', error);
    
    // Update DB with error state
    await incrementDeliveryAttempts(params.notificationId, error);

    return { success: false, error: String(error) };
  }
}

function getChannelsForPreference(
  pref?: 'immediate' | 'daily_digest'
): string[] {
  // Phase 1: email only
  // Phase 2+: extend to SMS, Slack, etc.
  return ['email'];
}
```

### 3.3 Webhook Handler (`app/api/v1/webhooks/knock/delivery-status/route.ts`)

```typescript
/**
 * Knock calls this webhook when email is delivered/bounced/failed
 * 
 * Webhook security:
 * - Verify Knock-Signature header
 * - Ensure idempotency (webhook may fire multiple times)
 * - Log all events for troubleshooting
 */

interface KnockWebhookPayload {
  type: 'message.delivered' | 'message.bounced' | 'message.failed';
  data: {
    message_id: string;  // Maps to notifications.email_service_id
    user_id: string;
    channel: string;     // 'email'
    status: string;
    delivered_at?: string;
    bounced_at?: string;
    failed_at?: string;
    bounce_reason?: 'hard' | 'soft' | 'complaint';
    failure_reason?: string;
  };
}

export async function POST(req: Request) {
  // 1. Verify Knock signature
  const signature = req.headers.get('knock-signature');
  const body = await req.text();
  
  if (!verifyKnockSignature(body, signature, process.env.KNOCK_SIGNING_KEY!)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = JSON.parse(body) as KnockWebhookPayload;

  // 2. Find notification by knock message_id
  const notification = await db
    .select()
    .from(notifications)
    .where(eq(notifications.emailServiceId, payload.data.message_id))
    .limit(1);

  if (!notification) {
    // Message ID not found; maybe already processed. Log and continue.
    console.warn(`Knock webhook for unknown message_id: ${payload.data.message_id}`);
    return new Response('OK', { status: 200 });
  }

  // 3. Update notification status based on event type
  const statusMap = {
    'message.delivered': 'sent',
    'message.bounced': 'bounced',
    'message.failed': 'failed',
  };

  await db
    .update(notifications)
    .set({
      emailStatus: statusMap[payload.type],
      emailSentAt: payload.data.delivered_at 
        ? new Date(payload.data.delivered_at)
        : undefined,
      updatedAt: new Date(),
    })
    .where(eq(notifications.id, notification.id));

  // 4. If hard bounce, pause future emails to this user
  if (payload.data.bounce_reason === 'hard') {
    await db
      .update(userNotificationPrefs)
      .set({ emailPaused: true })
      .where(eq(userNotificationPrefs.userId, payload.data.user_id));

    console.warn(`Hard bounce detected for user ${payload.data.user_id}; paused emails`);
  }

  return new Response('OK', { status: 200 });
}

function verifyKnockSignature(
  body: string,
  signature: string | null,
  signingKey: string
): boolean {
  if (!signature) return false;
  const expectedSignature = createHmac('sha256', signingKey)
    .update(body)
    .digest('hex');
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### 3.4 Integration with Moderation Review Handler

```typescript
// app/api/v1/mod/contributions/[id]/review/route.ts

async function handlePost(req: Request, ctx: RouteContext) {
  // ... existing code ...

  // After creating notification in DB:
  if (contribution.userId) {
    const notificationType = action === 'approve'
      ? 'contribution_approved'
      : action === 'return'
        ? 'contribution_returned'
        : 'changes_requested';

    // 1. Create DB notification record
    const notification = await createNotification({
      userId: contribution.userId,
      type: notificationType,
      refType: 'contribution',
      refId: contributionId,
      title: `Your contribution was ${action === 'approve' ? 'approved' : 'returned'}`,
      body: comment || undefined,
      url: `/contributions/${contributionId}`,
      data: {
        entity_type: contribution.entityType,
        entity_id: contribution.entityId,
        moderator_comment: comment || null,
      },
    });

    // 2. Get user's notification preference
    const userPrefs = await getUserNotificationPrefs(contribution.userId);
    const deliveryPref = mapActionToDeliveryPref(action, userPrefs);

    // 3. Send via Knock (async, no await — fire-and-forget with error logging)
    sendKnockNotification({
      notificationId: notification.id,
      recipientId: contribution.userId,
      templateId: `knock_${notificationType}`,
      data: {
        entity_type: contribution.entityType,
        entity_slug: contribution.entitySlug,
        moderator_comment: comment || null,
        action: action,
      },
      deliveryPreference: deliveryPref,
      userEmail: contributor.email,
    }).catch((err) => {
      console.error('Knock send failed for notification', notification.id, err);
      // Will retry via cron job
    });
  }

  // ... rest of handler ...
}

function mapActionToDeliveryPref(
  action: ReviewAction,
  prefs: UserNotificationPrefSelect
): 'immediate' | 'daily_digest' {
  if (action === 'approve') {
    return prefs.contributionStatusDelivery === 'email_daily' ? 'daily_digest' : 'immediate';
  }
  return 'immediate';  // Return and request_changes are always immediate
}
```

### 3.5 Retry/Cron Job (`lib/cron/notification-retry.ts`)

```typescript
/**
 * Cron job to retry failed notification sends
 * 
 * Triggered every 30 minutes by a scheduled function (Vercel Cron)
 */

export async function retryFailedNotifications() {
  const db = getDb();
  
  // Find pending notifications older than 5 min (allow initial processing time)
  const failedNotifs = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.emailStatus, 'pending'),
        sql`${notifications.createdAt} < NOW() - INTERVAL '5 minutes'`,
        sql`${notifications.deliveryAttempts} < 3`,
        isNotNull(notifications.emailServiceId)
      )
    )
    .limit(100);  // Batch size

  for (const notif of failedNotifs) {
    try {
      // Re-fetch notification data and resend
      const user = await db.query.users.findFirst({
        where: (u) => eq(u.id, notif.userId),
      });

      if (!user) {
        await db
          .update(notifications)
          .set({ emailStatus: 'failed' })
          .where(eq(notifications.id, notif.id));
        continue;
      }

      // Attempt to resend
      await sendKnockNotification({
        notificationId: notif.id,
        recipientId: notif.userId,
        templateId: notif.type, // Use stored type
        data: notif.data,
        userEmail: user.email,
      });

      // Update attempt counter
      await db
        .update(notifications)
        .set({
          deliveryAttempts: sql`${notifications.deliveryAttempts} + 1`,
        })
        .where(eq(notifications.id, notif.id));
    } catch (err) {
      console.error(`Retry failed for notification ${notif.id}:`, err);
    }
  }
}
```

### 3.6 Knock Template Configuration (Dashboard Setup, Not Code)

In Knock Dashboard, create templates:

**Template: `knock_contribution_approved`**
```
Name: Contribution Approved
Channel: Email
Subject: "Your edit to {{entity_type}} was approved!"
Body:
  {{entity_type}} | {{entity_slug}}
  
  ✓ Your contribution has been approved and applied live.
  
  {{#if moderator_comment}}
  Moderator Feedback:
  {{moderator_comment}}
  {{/if}}
  
  [View Entity →]({{entity_url}})
  [View Contribution →]({{contribution_url}})

Variables:
  - entity_type: string
  - entity_slug: string
  - moderator_comment: string (optional)
  - entity_url: string
  - contribution_url: string
```

**Template: `knock_contribution_returned`**
```
Name: Contribution Returned
Channel: Email
Subject: "Your contribution needs revision"
Body:
  {{entity_type}} | {{entity_slug}}
  
  ⚠ Your contribution has been returned for revision.
  
  Reason:
  {{moderator_comment}}
  
  Please review and resubmit.
  
  [Resubmit →]({{contribution_url}})

Variables:
  - entity_type: string
  - entity_slug: string
  - moderator_comment: string (required)
  - contribution_url: string
```

**Template: `knock_changes_requested`**
```
Name: Changes Requested
Channel: Email
Subject: "Changes requested on your contribution"
Body:
  {{entity_type}} | {{entity_slug}}
  
  🔄 Changes have been requested on your contribution.
  
  Feedback:
  {{moderator_comment}}
  
  [Review & Update →]({{contribution_url}})

Variables:
  - entity_type: string
  - entity_slug: string
  - moderator_comment: string (required)
  - contribution_url: string
```

**Template: `knock_entity_updated`**
```
Name: Entity Updated
Channel: Email
Subject: "{{entity_type}} updated"
Body:
  You're following {{entity_slug}}, and it's been updated.
  
  Change: {{edit_summary}}
  
  [View Now →]({{entity_url}})

Variables:
  - entity_type: string
  - entity_slug: string
  - edit_summary: string
  - entity_url: string
```

---

## 4. Implementation Sequence (LDR-97 Subtasks)

### Phase 1A: Foundation

- **LDR-97.1:** Set up Knock account & API key (ops task)
- **LDR-97.2:** Implement `knock-client.ts` with tests
- **LDR-97.3:** Create `sendKnockNotification()` with error handling
- **LDR-97.4:** Create webhook endpoint for delivery status updates

### Phase 1B: Integration

- **LDR-97.5:** Update moderation review handler to call `sendKnockNotification()`
- **LDR-97.6:** Create Knock templates in dashboard
- **LDR-97.7:** Add retry cron job for failed notifications
- **LDR-97.8:** Integration tests: contribution approval flow

### Phase 1C: Testing & Hardening

- **LDR-97.9:** E2E test on staging (full flow: submit → approve → email received)
- **LDR-97.10:** Error handling tests (API down, invalid email, etc.)
- **LDR-97.11:** Load testing (high volume notification send)
- **LDR-97.12:** Documentation & runbook

---

## 5. Environment Configuration

### 5.1 Required Environment Variables

```bash
# .env.local (development)
KNOCK_API_KEY=sk_live_...  # Get from Knock dashboard
KNOCK_WORKSPACE_ID=<workspace_id>
KNOCK_SIGNING_KEY=<webhook_signing_key>

# Vercel (production)
# Same vars set in Vercel project settings
```

### 5.2 Knock Dashboard Configuration

**Workspace Settings:**
- API Key: Generated, store in env
- Webhook URL: `https://commongrid.info/api/v1/webhooks/knock/delivery-status`
- Webhook Events: `message.delivered`, `message.bounced`, `message.failed`
- Signing Key: Generated, store in env

---

## 6. Error Scenarios & Handling

| Scenario | Handling | Recovery |
|----------|----------|----------|
| Knock API timeout | Log error, retry after 5min | Cron job `notification-retry` |
| Invalid recipient email | Catch, mark as 'failed' | Manual intervention needed |
| Hard email bounce | Update user `emailPaused=true` | Manual unpausing |
| Webhook signature invalid | Reject (401) | Log for ops investigation |
| Duplicate webhook | Idempotent (check email_service_id exists) | Re-update same row |
| User doesn't exist in Knock | Create via `syncUser()` before send | Transparent retry |

---

## 7. Rollout Plan

### Pre-Rollout (Staging)

1. Deploy code to staging
2. Set env vars in staging Vercel project
3. Run E2E tests: submit contribution → approve → verify email received
4. Have ops team send test emails via Knock dashboard

### Launch (Production)

1. Set env vars in production Vercel
2. Create Knock templates
3. Set webhook URL in Knock dashboard
4. Deploy to production
5. Monitor: logs, webhook delivery rate, email bounces
6. Alert: if > 5% failure rate, rollback to manual notification system

### Post-Launch Monitoring

- Daily: Check email bounce rate
- Weekly: Review failed notification queue
- Monthly: User feedback on email delivery

---

## 8. Success Metrics

| Metric | Target | Method |
|--------|--------|--------|
| Email delivery rate | > 95% | Monitor webhook events |
| Delivery latency | < 60s | Log send time vs webhook time |
| User engagement | > 15% open rate | Knock analytics |
| False positives | 0 duplicate sends | Verify idempotency key dedup |
| Cron success rate | 100% | Log cron job execution |

---

**Document Owner:** commongrid-engineer  
**Last Updated:** 2026-04-21 13:47 UTC  
**Status:** Ready for implementation
