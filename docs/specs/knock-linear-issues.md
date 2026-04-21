# Knock Notifications Integration — Linear Issues (LDR-97 Suite)

**Created:** 2026-04-21  
**Parent Epic:** LDR-97  
**Milestone:** V1.0 (April 2026)  
**Priority:** High (blocks moderator workflow improvement)

---

## Epic: LDR-97 — Knock Notifications Integration

**Description:** Integrate Knock as the multi-channel notification platform for CommonGrid to enable email delivery of moderator alerts and contributor status updates.

**Acceptance Criteria:**
- ✅ Moderator receives email within 60s of new contribution submission
- ✅ Contributor receives email within 60s of approval/return/request-changes
- ✅ Email delivery status tracked and retried automatically
- ✅ 100% test coverage for notification flow
- ✅ Zero duplicate notifications
- ✅ User preferences respected (immediate vs daily digest)

**Story Points:** 13 (5 subtasks, 2–3 points each)

---

## Subtasks

### LDR-97.1 — Knock Account Setup & API Keys (Ops)

**Type:** Task  
**Priority:** Critical  
**Complexity:** 1 (simple setup)  
**Assignee:** [@ops-team]  
**Due:** 2026-04-21

**Description:**

Set up Knock workspace for CommonGrid production.

**Tasks:**
1. Sign up for Knock production account (commongrid.info domain)
2. Create API Key (starts with `sk_live_`)
3. Create Webhook Signing Key
4. Configure webhook endpoint: `https://commongrid.info/api/v1/webhooks/knock/delivery-status`
5. Subscribe to events: `message.delivered`, `message.bounced`, `message.failed`
6. Store API Key & Signing Key in 1Password (ops vault)
7. Share with engineers via 1Password

**Acceptance Criteria:**
- [ ] Knock workspace is active and accessible
- [ ] API Key and Signing Key are securely stored in 1Password
- [ ] Webhook URL is registered in Knock dashboard
- [ ] Test webhook delivery is working (test event fires, endpoint responds 200)

**References:**
- Knock docs: https://docs.knock.app/getting-started/setup

---

### LDR-97.2 — Implement Knock Client Library

**Type:** Story  
**Priority:** High  
**Complexity:** 3  
**Assignee:** [@commongrid-engineer]  
**Due:** 2026-04-22

**Description:**

Create the Knock API client wrapper (`lib/knock-client.ts`) with full error handling, retries, and request validation.

**Acceptance Criteria:**
- [ ] `KnockClient` class exported with public methods:
  - `syncUser(userId, userData)` — Create/update user in Knock
  - `sendNotification(params)` — Send notification to recipient
  - `sendBulkNotification(params)` — Send to multiple users
  - `setUserPreferences(userId, prefs)` — Set user channel preferences
- [ ] All requests include proper error handling (throw ApiError on non-200 responses)
- [ ] Exponential backoff retry logic (max 3 attempts) for transient errors
- [ ] Request timeout: 10 seconds
- [ ] Logging: All requests logged at debug level, errors at warn/error level
- [ ] Unit tests: 100% code coverage
  - Mocked Knock API responses
  - Test error scenarios (API down, invalid credentials, malformed response)
  - Test retry logic
- [ ] TypeScript types for all public methods
- [ ] JSDoc comments on all exported functions

**Technical Notes:**
- Use `node-fetch` or native `fetch()` API (Node.js 18+)
- Knock API base: `https://api.knock.app/v1`
- Auth: Bearer token in Authorization header
- Request signing: Not needed (API Key in header is sufficient)

**Files to Create:**
- `lib/knock-client.ts` (main class)
- `lib/knock-client.test.ts` (tests)

**References:**
- Knock API docs: https://docs.knock.app/rest-api/overview
- Engineering spec: knock-engineering-erd.md §3.1

---

### LDR-97.3 — Implement sendKnockNotification() Function

**Type:** Story  
**Priority:** High  
**Complexity:** 3  
**Assignee:** [@commongrid-engineer]  
**Due:** 2026-04-23

**Description:**

Create the high-level `sendKnockNotification()` function that:
1. Respects user notification preferences
2. Syncs user data to Knock before sending
3. Updates DB notification status with Knock message ID
4. Handles errors gracefully with retry-friendly status codes

**Acceptance Criteria:**
- [ ] Function signature matches spec (knock-engineering-erd.md §3.2)
- [ ] Syncs user to Knock before sending (idempotent)
- [ ] Maps delivery preferences to Knock channels:
  - `'immediate'` → `['email']` with no delay
  - `'daily_digest'` → `['email']` with 1440-min (24h) delay for Knock batching
- [ ] Returns `{ success: true, knockMessageId }` on success
- [ ] Returns `{ success: false, error }` on failure (no exception)
- [ ] Updates `notifications.email_service_id` with Knock message ID
- [ ] Increments `notifications.delivery_attempts` on error
- [ ] Catches and logs all exceptions
- [ ] Uses `idempotencyKey = notification.id` to prevent Knock deduplication issues
- [ ] Unit tests: 100% coverage
  - Happy path (successful send)
  - User sync failure (retry send)
  - Knock API failure (return error without exception)
  - DB update failure (log and return error)
- [ ] Integration test: Create notification → call function → verify DB updated

**Files to Create/Modify:**
- `lib/notifications/send-knock.ts` (new)
- `lib/notifications/send-knock.test.ts` (new)

**References:**
- Engineering spec: knock-engineering-erd.md §3.2
- Depends on: LDR-97.2

---

### LDR-97.4 — Create Knock Delivery Status Webhook Endpoint

**Type:** Story  
**Priority:** High  
**Complexity:** 3  
**Assignee:** [@commongrid-engineer]  
**Due:** 2026-04-24

**Description:**

Implement the webhook handler at `/api/v1/webhooks/knock/delivery-status` that:
1. Validates Knock webhook signature
2. Maps Knock events to notification status updates
3. Handles hard email bounces (pause user emails)
4. Implements idempotency

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/v1/webhooks/knock/delivery-status`
- [ ] Signature validation:
  - Extract `Knock-Signature` header
  - Compute HMAC-SHA256(body, signing key)
  - Compare with timing-safe equality
  - Return 401 if invalid
- [ ] Event handling:
  - `message.delivered` → Update `email_status = 'sent'`, set `email_sent_at`
  - `message.bounced` → Update `email_status = 'bounced'`
  - `message.failed` → Update `email_status = 'failed'`
  - `message.hard_bounce` → Also set `user.emailPaused = true`
- [ ] Idempotency:
  - Lookup notification by `email_service_id`
  - If already processed (status != 'pending'), return 200 (no re-update)
  - Log webhook duplicate for monitoring
- [ ] Error handling:
  - Unknown message_id → Log warning, return 200 (don't fail webhook)
  - DB error → Log error, return 500 (Knock will retry)
- [ ] Logging:
  - Log all events at info level
  - Log hard bounces at warn level
  - Include notification ID, user ID, event type
- [ ] Unit tests:
  - Valid signature, valid event → status updated
  - Invalid signature → 401
  - Unknown message_id → 200 (graceful)
  - Hard bounce → User pause flag set
  - Duplicate webhook → Idempotent (same update)
- [ ] Integration test: Mock Knock webhook → Verify DB updated

**Files to Create/Modify:**
- `app/api/v1/webhooks/knock/delivery-status/route.ts` (new)
- `lib/knock/webhook-validation.ts` (new helper)
- `app/api/v1/webhooks/knock/delivery-status/route.test.ts` (new)

**References:**
- Engineering spec: knock-engineering-erd.md §3.3
- Knock webhook docs: https://docs.knock.app/integrations/webhooks
- Depends on: LDR-97.2

---

### LDR-97.5 — Integrate Notifications into Moderation Review Handler

**Type:** Story  
**Priority:** High  
**Complexity:** 3  
**Assignee:** [@commongrid-engineer]  
**Due:** 2026-04-25

**Description:**

Update the moderation review handler (`app/api/v1/mod/contributions/[id]/review/route.ts`) to:
1. Call `sendKnockNotification()` after creating contributor notification
2. Respect user delivery preferences (immediate vs daily)
3. Fire-and-forget with error logging (don't block response)

**Acceptance Criteria:**
- [ ] After moderation action (approve/return/request_changes):
  - Create DB notification (existing code)
  - Get user's notification preference
  - Call `sendKnockNotification()` async (fire-and-forget)
  - Log errors but don't throw
- [ ] Map moderation action to delivery preference:
  - approve + user pref "email_daily" → `deliveryPreference = 'daily_digest'`
  - approve + user pref "email_immediate" → `deliveryPreference = 'immediate'`
  - return/request_changes → Always `'immediate'` (urgent)
- [ ] Pass to `sendKnockNotification()`:
  - `recipientId` = `contribution.userId`
  - `templateId` = `knock_contribution_approved` | `knock_contribution_returned` | `knock_changes_requested`
  - `data` includes: entity_type, entity_slug, moderator_comment (if present)
  - `userEmail` = contributor.email (for syncing to Knock)
- [ ] Error handling: Log to console.error, don't block handler response
- [ ] Tests:
  - Unit: Mock `sendKnockNotification()`, verify called with correct params
  - Integration: Moderation review → notification created + Knock called
- [ ] No changes to existing notification DB creation logic

**Files to Modify:**
- `app/api/v1/mod/contributions/[id]/review/route.ts`

**References:**
- Current code: app/api/v1/mod/contributions/[id]/review/route.ts lines 501–515
- Engineering spec: knock-engineering-erd.md §3.4
- Depends on: LDR-97.3

---

### LDR-97.6 — Create Knock Email Templates in Dashboard

**Type:** Task  
**Priority:** High  
**Complexity:** 2  
**Assignee:** [@ops-team or @product]  
**Due:** 2026-04-26

**Description:**

Create 4 email templates in the Knock dashboard for CommonGrid notifications.

**Templates to Create:**

1. **knock_contribution_approved**
   - Subject: "Your edit to {{entity_type}} was approved!"
   - Channel: Email
   - Variables: entity_type, entity_slug, moderator_comment (opt), entity_url, contribution_url
   - Body: Approval message + optional moderator feedback + CTA links

2. **knock_contribution_returned**
   - Subject: "Your contribution needs revision"
   - Channel: Email
   - Variables: entity_type, entity_slug, moderator_comment (required), contribution_url
   - Body: Return reason + moderator feedback + resubmit CTA

3. **knock_changes_requested**
   - Subject: "Changes requested on your contribution"
   - Channel: Email
   - Variables: entity_type, entity_slug, moderator_comment (required), contribution_url
   - Body: Change request + feedback + review CTA

4. **knock_entity_updated** (for followers, Phase 2 start)
   - Subject: "{{entity_type}} updated"
   - Channel: Email
   - Variables: entity_type, entity_slug, edit_summary, entity_url
   - Body: Update notification for followers

**Acceptance Criteria:**
- [ ] All 4 templates created in Knock dashboard
- [ ] Subject lines match above
- [ ] Templates include basic HTML styling (Knock default OK)
- [ ] Variable placeholders used in template body
- [ ] Unsubscribe link automatically added by Knock
- [ ] Test send works (ops team sends test email)
- [ ] Screenshots of templates documented in PR

**References:**
- Template designs: knock-engineering-erd.md §3.6
- Knock template docs: https://docs.knock.app/designing-workflows/template-editor

---

### LDR-97.7 — Implement Notification Retry Cron Job

**Type:** Story  
**Priority:** Medium  
**Complexity:** 2  
**Assignee:** [@commongrid-engineer]  
**Due:** 2026-04-27

**Description:**

Create a cron job that runs every 30 minutes to retry failed notification sends.

**Acceptance Criteria:**
- [ ] Cron job triggered every 30 minutes (Vercel Cron)
- [ ] Finds notifications matching:
  - `email_status = 'pending'` AND
  - `created_at < NOW() - 5 minutes` (allow initial processing) AND
  - `delivery_attempts < 3`
- [ ] For each failed notification:
  - Re-fetch user data
  - Call `sendKnockNotification()` with same params
  - Increment `delivery_attempts`
- [ ] Batch size: 100 notifications per run
- [ ] Logging: Log start, retried count, errors
- [ ] Error handling: Log error but continue (don't stop on first error)
- [ ] Exit code: 0 if any reties succeeded, 1 if all failed (Vercel monitoring)
- [ ] Tests:
  - Create failed notifications
  - Mock time (advance clock)
  - Run cron
  - Verify notifications retried

**Files to Create/Modify:**
- `lib/cron/notification-retry.ts` (new)
- `app/api/v1/cron/notification-retry/route.ts` (new endpoint)

**Configuration:**
- Vercel cron schedule: `0 */30 * * * *` (every 30 min)
- Add to `vercel.json`:
  ```json
  {
    "crons": [{
      "path": "/api/cron/notification-retry",
      "schedule": "0 */30 * * * *"
    }]
  }
  ```

**References:**
- Engineering spec: knock-engineering-erd.md §3.5
- Vercel Cron docs: https://vercel.com/docs/cron-jobs
- Depends on: LDR-97.3

---

### LDR-97.8 — Integration Tests: Full Notification Flow

**Type:** Story  
**Priority:** High  
**Complexity:** 3  
**Assignee:** [@commongrid-engineer]  
**Due:** 2026-04-28

**Description:**

Write comprehensive integration tests covering the full notification flow from contribution submission through Knock delivery.

**Test Scenarios:**

1. **Happy Path: Contribution Approval**
   - Submit contribution
   - Approve as moderator
   - Verify DB notification created
   - Verify `sendKnockNotification()` called with correct params
   - Mock Knock API to return message ID
   - Verify `email_service_id` stored in DB

2. **User Preferences: Immediate vs Daily**
   - User A with "email_immediate" → Knock called with no delay
   - User B with "email_daily" → Knock called with 1440-min delay
   - Verify correct delivery preference passed

3. **Webhook Delivery Update**
   - Send notification
   - Mock Knock webhook: `message.delivered`
   - Call webhook endpoint
   - Verify `email_status = 'sent'` in DB

4. **Hard Bounce Handling**
   - Send notification
   - Mock Knock webhook: `message.bounced` (hard)
   - Call webhook endpoint
   - Verify user `emailPaused = true`

5. **Retry Logic**
   - Send notification, Knock API fails
   - Verify `delivery_attempts` incremented
   - Fast-forward time to trigger cron
   - Verify retry sent

**Acceptance Criteria:**
- [ ] 5+ integration test scenarios (E2E coverage)
- [ ] All tests pass with < 5s total run time
- [ ] 100% of integration points tested
- [ ] Mock Knock API responses (don't hit real API in tests)
- [ ] Use transactional DB rollback between tests
- [ ] Test file: `__tests__/integration/notifications.test.ts`

**Files to Create/Modify:**
- `__tests__/integration/notifications.test.ts` (new)

**References:**
- Engineering spec: knock-engineering-erd.md §4
- Depends on: LDR-97.2, LDR-97.3, LDR-97.4, LDR-97.5

---

### LDR-97.9 — E2E Testing on Staging

**Type:** Task  
**Priority:** High  
**Complexity:** 2  
**Assignee:** [@commongrid-engineer or @qa]  
**Due:** 2026-04-29

**Description:**

Manual end-to-end test on staging environment to verify full notification flow including real email delivery.

**Test Plan:**

1. **Setup:**
   - Deploy LDR-97.2–LDR-97.8 to staging
   - Set Knock env vars in Vercel staging
   - Configure Knock webhook URL to staging endpoint
   - Create test user with real email address (engineer's email)

2. **Test Scenario A: Contribution Approval**
   - Log in as test contributor
   - Submit a test contribution (e.g., new utility)
   - Log in as test moderator
   - Approve the contribution
   - Verify email received within 60s
   - Verify email contains:
     - Approval subject line
     - Entity name
     - Moderator comment (if provided)
     - Link to entity page

3. **Test Scenario B: Contribution Return**
   - Submit new test contribution
   - Return with moderator comment
   - Verify rejection email received within 60s
   - Verify email contains moderator comment

4. **Test Scenario C: Delivery Status Tracking**
   - Check DB: verify `email_status = 'sent'` after webhook fires
   - Verify `email_service_id` populated

5. **Test Scenario D: User Preferences**
   - Set user preference to "daily_digest"
   - Submit and approve contribution
   - Verify email NOT sent immediately
   - Manually trigger Knock batching or verify it's queued

**Acceptance Criteria:**
- [ ] All 4 test scenarios pass
- [ ] Emails received within 60s of action
- [ ] Email content includes all required fields
- [ ] DB status tracking accurate
- [ ] Test results documented in PR comments

**References:**
- Engineering spec: knock-engineering-erd.md §7 (Rollout Plan)

---

### LDR-97.10 — Documentation & Runbook

**Type:** Task  
**Priority:** Medium  
**Complexity:** 2  
**Assignee:** [@commongrid-engineer]  
**Due:** 2026-04-30

**Description:**

Create operational documentation and runbook for Knock notifications system.

**Documents to Create:**

1. **docs/notifications/knock-setup.md**
   - How to set up a new Knock workspace
   - API key management
   - Webhook configuration
   - Creating new templates

2. **docs/notifications/knock-operations.md**
   - How to monitor notification health
   - Common issues and troubleshooting
   - Retry logic and failure handling
   - How to manually pause/resume emails for a user

3. **docs/notifications/knock-development.md**
   - How to test notifications locally (mock Knock API)
   - Running integration tests
   - Creating new notification types
   - Testing email templates on staging

4. **docs/notifications/status-dashboard-queries.sql**
   - SQL queries for monitoring:
     - Pending notifications
     - Failed sends (bounces, failures)
     - User email pause status
     - Volume by type

**Acceptance Criteria:**
- [ ] 4 doc files created
- [ ] All runbook steps tested by author
- [ ] Screenshots of Knock dashboard (where applicable)
- [ ] Links to Knock docs included
- [ ] Added to main docs index

**References:**
- Similar docs: docs/database/ | docs/api/

---

## Summary Table

| Issue | Title | Story Points | Assignee | Due Date | Dependencies |
|-------|-------|--------------|----------|----------|--------------|
| LDR-97.1 | Knock Account Setup | 1 | @ops | 2026-04-21 | — |
| LDR-97.2 | Implement Knock Client | 3 | @engineer | 2026-04-22 | LDR-97.1 |
| LDR-97.3 | sendKnockNotification() | 3 | @engineer | 2026-04-23 | LDR-97.2 |
| LDR-97.4 | Webhook Endpoint | 3 | @engineer | 2026-04-24 | LDR-97.2 |
| LDR-97.5 | Moderation Integration | 3 | @engineer | 2026-04-25 | LDR-97.3 |
| LDR-97.6 | Email Templates | 2 | @ops | 2026-04-26 | LDR-97.1 |
| LDR-97.7 | Retry Cron | 2 | @engineer | 2026-04-27 | LDR-97.3 |
| LDR-97.8 | Integration Tests | 3 | @engineer | 2026-04-28 | All above |
| LDR-97.9 | E2E Testing | 2 | @engineer | 2026-04-29 | LDR-97.8 |
| LDR-97.10 | Documentation | 2 | @engineer | 2026-04-30 | All above |

**Total Effort:** 24 story points (~3 weeks for 1 engineer)

---

**Document Owner:** commongrid-engineer  
**Last Updated:** 2026-04-21 13:47 UTC  
**Status:** Ready to add to Linear (LDR-97 parent epic)
