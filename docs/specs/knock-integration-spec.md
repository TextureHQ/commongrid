# Knock Notifications Integration — Product Specification

**Document Version:** 1.0  
**Date Created:** 2026-04-21  
**Task ID:** LDR-97 (Linear)  
**Status:** Draft (pending expert review)

---

## Executive Summary

CommonGrid needs a production-grade notification system to:
1. **Alert moderators** when new contributions enter the moderation queue
2. **Notify contributors** about submission/approval/rejection status changes
3. **Inform entity followers** about updates to entities they follow
4. **Support multi-channel delivery** (email, in-app, future: SMS, Slack)

Knock is a modern notification platform designed for this use case, providing:
- Multi-channel orchestration (email, in-app, SMS, Slack, etc.)
- User preference management
- Workflow engine (delays, batching, digests)
- Comprehensive audit trails
- Developer-friendly API

---

## 1. Platform Event Analysis

### Current System State

CommonGrid already has:
- **Database schema** for notifications (`notifications`, `user_notification_prefs`)
- **Notification creation** in moderation review handler
- **User preference system** with per-event-type controls
- **Follower system** with entity subscriptions

**Gap:** Email delivery is not implemented (only database storage).

### Events Triggering Notifications

#### 1.1 Moderation Events

| Event | Trigger | Recipients | Current Behavior |
|-------|---------|------------|------------------|
| **Contribution Submitted** | User submits a change/CREATE/DELETE | Moderators | No notification sent |
| **Contribution Approved** | Moderator approves | Contributor | Notification created, not sent |
| **Contribution Returned** | Moderator returns for revision | Contributor | Notification created, not sent |
| **Changes Requested** | Moderator requests changes | Contributor | Notification created, not sent |
| **Entity Updated** | Approved contribution applied | Entity followers | Notification created, not sent |

#### 1.2 Community Events (Planned for Phase 2)

| Event | Trigger | Recipients | Status |
|-------|---------|------------|--------|
| **Discussion Reply** | User replies to entity discussion | Author, subscribers | Planned |
| **Appeal Resolved** | Moderator resolves content appeal | Appellant | Planned |
| **Trusted Status Earned** | User reaches community milestone | User | Planned |

### Notification Types (Enum)

```typescript
type NotificationType =
  | "contribution_submitted"        // NEW: moderator queue alert
  | "contribution_approved"         // Existing: contributor notification
  | "contribution_returned"         // Existing: contributor notification
  | "changes_requested"             // Existing: contributor notification
  | "entity_updated"                // Existing: follower notification
  | "discussion_reply"              // Planned: Phase 2
  | "appeal_resolved"               // Planned: Phase 2
  | "trusted_status_earned";        // Planned: Phase 2
```

---

## 2. Notification Delivery Channels

### 2.1 Phase 1 (MVP — April 2026)

**Email** — Primary channel for moderator alerts and contributor notifications.

**In-App** — Secondary; real-time on-platform notification center.

### 2.2 Phase 2+ (Future Roadmap)

**SMS** — Urgent moderator notifications (moderation queue backlog alert)

**Slack** — For moderators; sends moderation queue summary

**Push Notifications** — Mobile app (future, when mobile app exists)

---

## 3. User Segments & Preferences

### 3.1 Moderators

**Preferences:**
- Email on every new contribution (`immediate`)
- Batched daily summary of resolved contributions
- Optional: SMS alert if queue backlog > 10 pending

**Channels:** Email (default), Slack integration (future)

**Opt-out:** Can disable email globally

### 3.2 Contributors

**Preferences (per event type):**
- `contribution_status_delivery`: 'email_immediate' | 'email_daily' | 'in_app' | 'off'
- `followedChangesDelivery`: 'email_daily' | 'in_app' | 'off'
- `discussionActivityDelivery`: 'in_app' | 'email_daily' | 'off'

**Default:** Email immediate on status changes

**Opt-out:** `emailPaused` global toggle

### 3.3 Entity Followers

**Preferences:**
- Per-entity subscription: `notifyAllChanges` (boolean)
- Per-entity discussions: `notifyDiscussions` (boolean)

**Delivery:** Email (daily digest by default)

---

## 4. Notification Lifecycle

### 4.1 Flow: Contribution Approval → Contributor Notification

```
[Moderator approves contribution]
           ↓
    [Create notification in DB]
           ↓
    [Send to Knock API]
           ↓
    [Knock routes by user preference]
       ↙          ↘
   [Email]    [In-App]
     ↓            ↓
  [Queue] [Store in DB, push via SSE/WebSocket Phase 2]
```

### 4.2 Database + Knock Sync

**Current:**
- Notification created in DB
- Email delivery never happens
- User reads from in-app center (polling)

**After Integration:**
- Notification created in DB (audit trail)
- Sent to Knock API (with user preferences)
- Knock delivers via preferred channels
- Knock webhook updates delivery status in DB

### 4.3 Data Consistency

**Single Source of Truth:** Database

- Notification record = audit trail (immutable)
- `emailStatus` column = delivery status (pending → sent → bounced)
- `emailServiceId` = Knock message ID (for troubleshooting)

**Idempotency:** Knock `idempotencyKey` = notification ID (prevents duplicate sends)

---

## 5. Use Cases

### UC-1: Moderator Alert on New Contribution

```
User submits contribution
    ↓
[Notification: "New contribution to review: PG&E utility update"]
    ↓
Route via Knock:
  - Email: Immediate (if moderator has immediate pref)
  - In-App: Bell icon badge
    ↓
[Moderator clicks email link or in-app notif]
→ Opens contribution review UI
→ Approves/Returns/Requests changes
```

**Knock Template:** `contribution_submitted_mod`

**Recipient:** Moderators (user role = "moderator")

**Urgency:** High (shown in subject line)

---

### UC-2: Contributor Notification on Approval

```
Moderator approves contribution
    ↓
[Notification: "Your update to PG&E was approved!"]
    ↓
Route via Knock:
  - Email: If `contribution_status_delivery` = email_immediate/daily
  - In-App: If in_app pref or email_paused
    ↓
[Contributor sees notification]
→ Links to entity page
→ Sees their changes live
```

**Knock Template:** `contribution_approved`

**Recipient:** Contribution author

**Customization:** If comment provided, include in email body

---

### UC-3: Entity Follower Update

```
Approved contribution applied to entity
    ↓
[Notification: "EV Charging Stations in California updated"]
    ↓
Fetch all users following [entity_type, entity_id]
    ↓
Filter: `notifyAllChanges = true`
    ↓
Route via Knock (delivery preference = daily digest)
    ↓
[Knock batches; sends daily summary email]
```

**Knock Template:** `entity_updated`

**Recipients:** Entity followers with `notifyAllChanges = true`

**Batching:** Daily digest (Knock's batching feature)

---

## 6. Knock Configuration & Architecture

### 6.1 Knock Setup

**Workspace:** CommonGrid production Knock workspace

**API Key:** Stored in env var `KNOCK_API_KEY` (Vercel secret)

**Signature Key:** For webhook validation (env var `KNOCK_SIGNING_KEY`)

### 6.2 User Mapping

**Knock User ID** = CommonGrid `user.id` (UUID)

**Metadata:** Email, name, role (moderator vs contributor)

**Example:**
```json
{
  "id": "user_uuid_123",
  "email": "alice@example.com",
  "name": "Alice Contributors",
  "custom_attributes": {
    "role": "contributor",
    "approved_count": 5,
    "is_moderator": false
  }
}
```

### 6.3 Notification Templates (Knock)

**In Knock Dashboard, create:**

1. **`contribution_submitted_mod`** — New contribution for review
   - Channel: Email
   - Template: "New contribution to review: [entity_type] [entity_slug]"
   - Recipient: Moderators only

2. **`contribution_approved`** — Contribution approved
   - Channels: Email, In-App
   - Template: "Your contribution to [entity_type] was approved"
   - Personalization: Include moderator comment if present

3. **`contribution_returned`** — Contribution returned
   - Channels: Email, In-App
   - Template: "Your contribution needs revision"
   - Personalization: Include moderator comment (required)

4. **`changes_requested`** — Changes requested
   - Channels: Email, In-App
   - Template: "Changes requested on your contribution"
   - Personalization: Include moderator feedback

5. **`entity_updated`** — Entity update notification
   - Channel: Email (daily digest)
   - Template: "[entity_type] updated: [summary]"
   - Batching: Daily 9am UTC

### 6.4 Delivery Preferences in Knock

**Knock Recipient Rules:**

```
If (notificationType == "contribution_submitted_mod"):
  Send to: role == "moderator"
  Channel: Email (immediate)
  
If (notificationType == "contribution_approved" && recipientPref == "email_immediate"):
  Send to: contributor user
  Channel: Email (immediate)
  
If (recipientPref == "email_daily"):
  Send to: recipient user
  Channel: Email
  Schedule: Daily 9am UTC
  Batch: True
  
If (recipientPref == "in_app"):
  Send to: recipient user
  Channel: In-App (Phase 2)
  
If (recipientPref == "off"):
  Do not send
```

---

## 7. Implementation Phases

### Phase 1: Core Integration (Week 1 - April 21-27)

**Goals:**
- Set up Knock API client in CommonGrid
- Integrate with moderation review flow
- Send moderator alerts on new contributions
- Send contributor notifications on approval/return/request_changes

**Deliverables:**
- `knock-client.ts` — Knock API wrapper
- `sendKnockNotification()` function
- Update moderation review handler
- Webhook endpoint for delivery status updates
- Tests (unit + integration)

### Phase 2: Follower Notifications (Week 2 - April 28-May 4)

**Goals:**
- Entity follower notifications
- Daily digest batching
- Full template suite in Knock

### Phase 3: Advanced Features (May+)

**Goals:**
- SMS for urgent moderator alerts
- Slack integration
- Push notifications (mobile app)
- In-app real-time push (WebSocket)

---

## 8. Data Model Changes

### 8.1 Notifications Table (existing)

Already has all needed columns:
```sql
- id UUID (primary key)
- user_id UUID (FK to users)
- type TEXT (notification_type enum)
- ref_type TEXT (polymorphic reference)
- ref_id TEXT (polymorphic reference)
- title TEXT
- body TEXT
- url TEXT
- data JSONB
- read_at TIMESTAMP (in-app read tracking)
- email_type TEXT ('immediate' | 'daily_digest')
- email_status TEXT ('pending' | 'sent' | 'bounced' | 'failed')
- email_service_id TEXT (← Knock message ID goes here)
- delivery_attempts INTEGER
- created_at TIMESTAMP
```

### 8.2 New Columns (Optional Phase 2)

```sql
-- Track which Knock channel actually sent the notification
ALTER TABLE notifications ADD COLUMN knock_channels TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Track if this notification was batched in a digest
ALTER TABLE notifications ADD COLUMN batched_into_id UUID REFERENCES notifications(id);
```

### 8.3 User Notification Prefs (existing, no changes)

Already has:
```sql
- user_id UUID (PK)
- contribution_status_delivery TEXT
- followed_changes_delivery TEXT
- discussion_activity_delivery TEXT
- appeal_resolved_delivery TEXT
- email_paused BOOLEAN
- digest_hour INTEGER
```

---

## 9. API Integration Points

### 9.1 Moderation Review Handler (UPDATE)

**Current Flow:**
```typescript
// Approve contribution
await db.insert(moderationActions).values({...});
await createNotification({...});  // ← Only creates DB record
```

**New Flow:**
```typescript
// Approve contribution
await db.insert(moderationActions).values({...});
const notification = await createNotification({...});  // DB record

// SEND to Knock
await sendKnockNotification(notification, {
  recipientId: contribution.userId,
  templateId: 'contribution_approved',
  data: { ... }
});
```

### 9.2 New Endpoints

#### POST /api/v1/webhooks/knock/delivery-status

Knock calls this to update email delivery status.

```typescript
{
  "event": "message.delivered" | "message.bounced" | "message.failed",
  "data": {
    "message_id": "knock_msg_id_123",  // ← Maps to email_service_id
    "delivery_status": "delivered" | "bounced" | "failed",
    "channel": "email",
    "timestamp": "2026-04-21T13:47:00Z",
    "bounce_reason": "hard_bounce" // optional
  }
}
```

Updates `notifications.email_status` and `delivery_attempts`.

---

## 10. Error Handling & Reliability

### 10.1 Knock API Failures

**Scenario:** Knock API is down, POST fails

**Strategy:** Retry with exponential backoff
- DB notification status = "pending" (retry later)
- Store error in `delivery_attempts` field
- Cron job every 30 min: retry failed notifications (max 3 attempts)

### 10.2 Webhook Validation

Knock provides signature header: `Knock-Signature`

```typescript
// Verify request came from Knock
const isValid = verifyKnockSignature(
  request.body,
  request.headers['knock-signature'],
  process.env.KNOCK_SIGNING_KEY
);
```

### 10.3 Idempotency

Use notification ID as Knock `idempotencyKey`:
- Prevents duplicate sends if webhook fires twice
- Knock deduplicates based on key

---

## 11. Testing Strategy

### Unit Tests

- `knock-client.test.ts` — API client functions
- `sendKnockNotification.test.ts` — Notification send logic
- Webhook parsing and validation

### Integration Tests

- Moderation review flow → notification sent to Knock
- Webhook delivery status → DB updated
- Email preferences applied (immediate vs daily)

### E2E Tests (Staging)

- Contributor submits change
- Moderator approves
- Contributor receives email
- Email contains correct entity and moderator comment

---

## 12. User Preferences Configuration

### 12.1 Settings UI (Future)

Users can configure in a settings panel:

```
📧 Email Preferences
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contribution Status Updates
  ☑ Email immediately
  ☐ Daily digest
  ☐ In-app only
  ☐ Off

Entity Follower Updates
  ☑ Daily digest (9am UTC)
  ☐ Off

Discussion Replies
  ☐ Email
  ☑ In-app only
  ☐ Off

Global Email Pause: ☐ Pause all emails until [date]
```

### 12.2 Moderator-Only Settings

```
🔔 Moderator Alerts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
New Contributions to Review
  ☑ Email immediately
  ☐ Batched daily

Queue Backlog Alert (5+ pending)
  ☑ Email
  ☐ SMS alert
```

---

## 13. Monitoring & Analytics

### 13.1 Metrics to Track

- Notifications created (by type)
- Delivery success rate (%)
- Email bounces (hard vs soft)
- User email open rate (via Knock)
- In-app read rate
- Delivery latency (created → sent)

### 13.2 Dashboards

**Ops Dashboard:**
- Daily notification volume
- Failure rate (bounces, delivery failures)
- Queue depth (pending notifications)

**Product Dashboard:**
- Notification effectiveness (open rates, click-through)
- User preference breakdown

---

## 14. Known Limitations & Future Work

### 14.1 Phase 1 Limitations

- ✅ Email delivery only (SMS/Slack in Phase 2)
- ✅ Immediate or daily digest (no custom schedules yet)
- ✅ No in-app push (polling-based, Phase 2)
- ✅ No SMS alerts for moderators

### 14.2 Phase 2 / Roadmap

- [ ] SMS for urgent moderator alerts
- [ ] Slack integration (moderator summaries)
- [ ] In-app real-time notifications (WebSocket/SSE)
- [ ] Push notifications (when mobile app exists)
- [ ] Advanced batching (hourly, per-entity, custom rules)
- [ ] Notification preferences UI in product
- [ ] User unsubscribe links in emails (GDPR compliance)
- [ ] Preference center (Knock-hosted)

---

## 15. Success Criteria

**Phase 1 (MVP) Complete When:**

- ✅ Knock API client implemented and tested
- ✅ Moderator alert on new contribution (email) working
- ✅ Contributor notifications on approval/return/changes (email) working
- ✅ Email delivery status tracked in DB
- ✅ Webhook endpoint receiving delivery status updates
- ✅ Retry logic handles transient failures
- ✅ Unit + integration tests passing
- ✅ E2E test on staging confirms end-to-end flow
- ✅ Linear issues completed (LDR-97 subtasks)

**Acceptance Criteria:**

1. Moderator receives email within 60s of new contribution submission
2. Contributor receives email within 60s of moderation action
3. Email includes relevant context (entity name, comment if present)
4. User preferences respected (immediate vs daily)
5. No duplicate notifications sent
6. Failures are logged and can be retried
7. Email bounces trigger pause in future sends to that user

---

## Next Steps

1. **Expert Panel Review** — Share with Wikipedia/OSM/Reddit moderators
2. **Technical Review** — Get feedback from tech team
3. **Create Linear Issues** — Break Phase 1 into implementable tasks
4. **Begin Implementation** — LDR-97.1 through LDR-97.N

---

**Document Owner:** commongrid-engineer  
**Last Updated:** 2026-04-21 13:47 UTC  
**Status:** Ready for expert review
