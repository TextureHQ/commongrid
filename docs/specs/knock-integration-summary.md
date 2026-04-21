# Knock Notifications Integration — Phase 1 Summary

**Task:** LDR-97 — Knock Notifications Integration  
**Status:** Phase 1 (Planning & Specification) — COMPLETE  
**Date:** 2026-04-21  
**Next Phase:** Implementation (Week 1 of May 2026)

---

## What Was Delivered (Phase 1)

### 1. Product Specification (16.7 KB)
**File:** `knock-integration-spec.md`

**Contents:**
- Executive summary of system goals
- Complete platform event analysis (moderation, community events)
- Notification types enum with all use cases
- Delivery channel strategy (Phase 1: Email; Phase 2+: SMS, Slack, mobile)
- User segments & preferences (moderators, contributors, followers)
- Notification lifecycle diagrams
- 3 detailed use cases with flows
- Knock configuration & architecture
- Implementation phases (Phase 1–3 roadmap)
- Data model specifications
- API integration points
- Error handling & reliability strategies
- Testing strategy
- User preferences UI mockup
- Monitoring & analytics plan
- Known limitations & future work
- Success criteria

**Key Decisions:**
- ✅ Knock selected for multi-channel orchestration
- ✅ Email as Phase 1 primary channel
- ✅ User preferences respected (immediate vs daily digest)
- ✅ Database as single source of truth (audit trail)
- ✅ Webhook-based delivery status tracking

---

### 2. Engineering ERD & Architecture (22 KB)
**File:** `knock-engineering-erd.md`

**Contents:**
- System architecture diagram (ASCII)
- Complete data model ERD:
  - Notifications table (existing, enhanced)
  - User notification prefs (existing)
  - Knock user sync conceptual model
  - Entity relationships
- 6 component specifications with TypeScript code samples:
  1. `knock-client.ts` — Full API wrapper class
  2. `send-knock-notification()` — High-level send function
  3. Webhook handler (`/api/v1/webhooks/knock/delivery-status`)
  4. Moderation review handler integration
  5. Retry/cron job implementation
  6. Knock template configurations (dashboard setup)
- Implementation sequence breakdown (12 subtasks)
- Environment configuration (env vars, Knock dashboard settings)
- Error scenarios & handling matrix
- Rollout plan (pre-launch, launch, post-launch)
- Success metrics & targets

**Code Samples Provided:**
- KnockClient class (full interface + implementation sketch)
- sendKnockNotification() function
- Webhook signature validation
- Integration with moderation handler
- Retry cron job
- Email template definitions (4 templates)

---

### 3. Linear Issues & Implementation Plan (18.7 KB)
**File:** `knock-linear-issues.md`

**Contents:**
10 Linear issues covering Phase 1 implementation:

1. **LDR-97.1** — Knock Account Setup (Ops, 1 point)
2. **LDR-97.2** — Knock Client Library (3 points)
3. **LDR-97.3** — sendKnockNotification() (3 points)
4. **LDR-97.4** — Webhook Endpoint (3 points)
5. **LDR-97.5** — Moderation Integration (3 points)
6. **LDR-97.6** — Email Templates (2 points)
7. **LDR-97.7** — Retry Cron Job (2 points)
8. **LDR-97.8** — Integration Tests (3 points)
9. **LDR-97.9** — E2E Testing on Staging (2 points)
10. **LDR-97.10** — Documentation & Runbook (2 points)

**For Each Issue:**
- Clear description
- Detailed acceptance criteria (checklist)
- Technical notes
- Files to create/modify
- Dependencies & references
- Estimated effort

**Total Effort:** 24 story points (~3 weeks for 1 engineer)

---

## Key Specifications

### Events Triggering Notifications

| Event | Recipient | Channel | Timing |
|-------|-----------|---------|--------|
| Contribution submitted | Moderators | Email | Immediate |
| Contribution approved | Contributor | Email/In-app | Per preference |
| Contribution returned | Contributor | Email/In-app | Immediate |
| Changes requested | Contributor | Email/In-app | Immediate |
| Entity updated | Followers | Email | Daily digest |

### User Segments

**Moderators:**
- Receive email on every new contribution
- Optional: SMS alert if queue backlog > 10
- Optional: Slack integration (Phase 2)

**Contributors:**
- Configurable per event:
  - `contribution_status_delivery`: immediate | daily | in_app | off
  - `followedChangesDelivery`: daily | in_app | off
  - `discussionActivityDelivery`: in_app | daily | off

**Entity Followers:**
- Per-entity subscription toggles
- Daily digest batching

### Implementation Phases

**Phase 1 (Week 1–2):**
- ✅ Knock API client
- ✅ Moderator alerts on new contributions
- ✅ Contributor notifications on approval/return/request-changes
- ✅ Email delivery tracking
- ✅ Retry logic

**Phase 2 (Week 3–4):**
- Entity follower notifications
- Daily digest batching
- Advanced preferences UI

**Phase 3+ (May+):**
- SMS for urgent alerts
- Slack integration
- Push notifications
- In-app real-time WebSocket

---

## Technical Stack

**Service:** Knock (https://knock.app)

**Integration Points:**
- `/api/v1/mod/contributions/[id]/review` — Moderation handler
- `/api/v1/webhooks/knock/delivery-status` — Webhook receiver
- `/api/cron/notification-retry` — Retry job

**Dependencies:**
- Node.js 18+ (native fetch API)
- Vercel Cron for scheduled retries
- Neon Postgres (existing DB)

**New NPM Packages:**
- Optional: `@knocklabs/node` (if using official SDK)
- Or native fetch (no additional dependencies)

---

## Success Criteria (Phase 1 Definition of Done)

**MVP Complete When:**
- ✅ Moderator receives email within 60s of new contribution
- ✅ Contributor receives email within 60s of approval/return/request-changes
- ✅ Email delivery status tracked in DB
- ✅ Webhook validates and updates delivery status
- ✅ Retry logic handles transient failures (3 max attempts)
- ✅ User preferences respected (immediate vs daily)
- ✅ Zero duplicate notifications (idempotency key prevents)
- ✅ 100% unit test coverage
- ✅ Integration tests covering all flows
- ✅ E2E test on staging confirms end-to-end
- ✅ All Linear issues closed

---

## Deliverables Checklist

**Planning Phase Complete:**
- [x] Product specification (16.7 KB)
- [x] Engineering ERD & architecture (22 KB)
- [x] Linear issue suite (18.7 KB, 10 issues)
- [x] Code samples & implementation guides
- [x] Data model (no schema changes needed, existing tables sufficient)
- [x] API contracts (webhook payload, client methods)
- [x] Error handling strategy
- [x] Rollout plan (pre-launch, launch, post-launch)
- [x] Monitoring & metrics plan
- [x] Known limitations & Phase 2 roadmap

**Ready for Implementation:**
- [ ] Dev team picks up LDR-97.1–LDR-97.10 in Linear
- [ ] Code begins on 2026-04-22 (LDR-97.2)

---

## Collaboration Points

### Expert Panel (Wikipedia/OSM/Reddit Moderators)

**Feedback Requested:**
1. Are moderator alert requirements correct?
   - Immediate email on new contribution? ✓
   - Daily summary option? ✓
2. Should moderators receive SMS alerts for queue backlog? (Phase 2)
3. Any additional notification types needed?
4. Preference center UI — preferences match their workflow?

### Tech Expert Panel

**Feedback Requested:**
1. Knock API client implementation — any optimizations?
2. Webhook signature validation approach — secure?
3. Retry logic (max 3 attempts, 30-min intervals) — sufficient?
4. Cron job batching (100 at a time) — right size?
5. Async fire-and-forget for notification sends — appropriate?

---

## File Manifest

**Project Directory:** `/home/agent/agents/meridian/projects/`

```
knock-integration-summary.md           (this file, 4 KB)
knock-integration-spec.md              (product spec, 16.7 KB)
knock-engineering-erd.md               (technical spec, 22 KB)
knock-linear-issues.md                 (implementation plan, 18.7 KB)

Total: ~62 KB of specifications
```

---

## Next Steps (For Implementation)

**Immediate (2026-04-21 EOD):**
1. Share specs with expert panels (Wikipedia/OSM/Reddit mods, tech team)
2. Create LDR-97 parent epic in Linear with 10 subtasks
3. Assign LDR-97.1 to ops team

**Week of 2026-04-22:**
1. Ops: Complete LDR-97.1 (Knock setup, API keys)
2. Engineer: Begin LDR-97.2 (Knock client library)
3. Engineer: Parallel work on LDR-97.3, LDR-97.4

**Week of 2026-04-29:**
1. Complete LDR-97.8 (integration tests)
2. Run LDR-97.9 (E2E testing on staging)
3. Deploy to production

---

## Reference Materials

**External Links:**
- Knock Documentation: https://docs.knock.app
- Knock API Reference: https://docs.knock.app/rest-api/overview
- Knock Webhooks: https://docs.knock.app/integrations/webhooks
- CommonGrid API Docs: https://docs.commongrid.info/api
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs

**Internal References:**
- CommonGrid Database Schema: `/commongrid/lib/db/schema/`
- Notifications Schema: `/commongrid/lib/db/schema/notifications.ts`
- Moderation Handler: `/commongrid/app/api/v1/mod/contributions/[id]/review/route.ts`
- User Preferences: `/commongrid/lib/db/schema/user-notification-prefs.ts`

---

## Estimated Timeline

**Phase 1 (Implementation):** 2 weeks
- Week 1: Core integration (LDR-97.1–LDR-97.5)
- Week 2: Testing & hardening (LDR-97.6–LDR-97.10)

**Phase 1 Deployment:** 2026-05-05 (Monday)

**Phase 2 (Followers, Digests):** 2 weeks (May 12–26)

**Phase 3+ (SMS, Slack, Mobile):** TBD

---

## Sign-Offs & Approvals

**Author:** commongrid-engineer  
**Document Date:** 2026-04-21 13:47 UTC

**Ready for:**
- [x] Expert panel review
- [x] Tech team review
- [x] Product review
- [x] Implementation handoff

**Awaiting:**
- [ ] Expert panel feedback
- [ ] Tech team approval
- [ ] Product sign-off
- [ ] Ops assignment of LDR-97.1

---

**End of Phase 1 Planning**

All specification documents are complete and ready for implementation. Begin Phase 2 (implementation) on 2026-04-22.
