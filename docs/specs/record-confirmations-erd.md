# CommonGrid: Record Confirmations — ERD & Technical Spec

## Technical Specification — Entity Relationship Design

**Version:** 0.1
**Author:** _TBD_
**Date:** November 10, 2026
**Status:** Draft RFC
**PRD Reference:** `docs/specs/record-confirmations-prd.md`

---

## 1. Executive Summary

One new append-only table, `record_confirmations`, one app API (`/api/v1/confirmations/{slug}`), and a drawer on
utility pages. No changes to existing tables, the contribution or moderation flow, or sync.

### Design Principles

1. **Additive only.** One new table; the only edits to existing files are an import and entry point on the utility
   page, one middleware path, and one OpenAPI-check exclusion.
2. **A confirmation never changes the record.** It writes nothing to entity tables, `entity_versions`, or
   `field_moderation_state`.
3. **The confirmer is the citation.** Each row records which utility domain matched, who, and when.
4. **No new review states.** Rows are only written for a verified, matching email.

---

## 2. Entity Relationship Diagram (Textual)

```
utilities 1 ──< record_confirmations >── 0..1 users
               (utility_id)            (user_id, ON DELETE SET NULL)

record_confirmations.(entity_type, entity_id) → utilities.id | programs.id   (polymorphic, as entity_versions)
```

---

## 3. New Table

### 3.1 `record_confirmations`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `gen_random_uuid()` |
| `entity_type` | `text` | `'utility'` \| `'program'` |
| `entity_id` | `text` | The utility or program |
| `utility_id` | `text` | The confirming utility (for a program, the utility that runs it) |
| `field_name` | `text` | `'website'` \| `'generationProviderId'` \| `'status'` (camelCase, as `field_moderation_state`) |
| `confirmed_value` | `jsonb` | The value the person saw and confirmed |
| `user_id` | `text` FK → `users.id` | `ON DELETE SET NULL`, matching contribution history |
| `email_domain` | `text` | The utility domain the verified email matched, e.g. `4county.org` |
| `submission_id` | `text` | Groups fields confirmed together |
| `created_at` | `timestamptz` | `now()` |

Indexes: `(entity_type, entity_id, field_name)` for "latest confirmation of this field," and `(utility_id)` for
loading a utility's drawer.

**Append-only.** A confirmation applies while the field still equals `confirmed_value`, worked out when reading
(`buildRows` in `lib/confirmations/record.ts`). Nothing is updated when the record changes.

Migration: `drizzle/0043_add_record_confirmations.sql`. No grant for `commongrid_sync`; syncs never touch this table.

### 3.2 Why not `field_moderation_state` with a new `verification_type`

Considered first, and rejected for three reasons in the existing code:

1. **It would lock fields against sync.** `applySync` treats any active row as a lock, whatever its
   `verification_type` (`lib/sync/apply-sync.ts`, via `getModerationLockedFields`). Confirming `customer_count` would
   silently stop EIA updates to it. Avoiding that means filtering by type in the sync path.
2. **It would overwrite provenance.** The table holds one row per field, and `upsertFieldModerationState` replaces
   `contribution_id`, `reviewed_by` and `source_citation_id`. A confirmation would erase the pointer to the moderator
   approval it sits on.
3. **It keeps no history.** It stores current state only, so earlier confirmers, who are the citation, would be lost.

---

## 4. API

Both routes are app surface (like `/api/v1/contributions`): listed in `isClerkProtectedApiPath` in `middleware.ts`,
and excluded from the public OpenAPI coverage check.

### `GET /api/v1/confirmations/{slug}`

Requires sign-in. Returns the utility (`id`, `slug`, `name`, `confirmerName`, `website`), its confirmable `rows` with
`lastConfirmedAt`, and `viewer: { emailDomain, canConfirm, matchedDomain }`. `Cache-Control: private, no-store`.

### `POST /api/v1/confirmations/{slug}`

Body: `{ fields: [{ entityType, entityId, fieldName, value }] }`, at most 50, where `value` is what the person saw.

| Response | When |
|---|---|
| `201 { saved, confirmedAt, confirmedBy }` | Saved. `saved` excludes repeats within 24 hours. |
| `401` | Not signed in |
| `403` | Banned, or no verified primary email at the utility's domains |
| `404` | Unknown utility |
| `409` | A value changed since the person loaded it |
| `400` | Malformed body, blank value, or a field this utility can't confirm |

---

## 5. Clerk Integration

The email check reads Clerk's server-side user (`currentUser()`) and uses `primaryEmailAddress` only when
`verification.status === "verified"`. It does not use `users.email`: when a user row is created on first request
(`ensureUserSynced`), that column is filled from `emailAddresses[0]`, which may not be the verified primary address.

Domain matching (`lib/confirmations/email-match.ts`): equal to a utility domain or a subdomain of it, never a parent
domain; personal email providers and shared website hosts never match.

---

## 6. Security Considerations

- **Spoofing affiliation** requires controlling a mailbox at the utility's domain that Clerk has verified.
- **Stale or forged values:** the server compares each submitted value with the stored one; mismatches get a 409.
- **Scope:** only fields in §3.1 for this utility and its programs; anything else is a 400.
- **Privacy:** names and emails are not shown. `email_domain` is the matched utility domain, not the full address.
- **Flooding:** at most 50 fields per request; repeats within 24 hours are skipped. If needed, the existing Upstash
  rate limiter used for contributions can be applied.

---

## 7. Row Estimates (first 6 months)

At most one row per confirmable field per confirmation. With outreach to all ~835 co-ops and a generous 30% response
rate, roughly 250 utilities × ~4 fields × a few confirmations each: under 5,000 rows.

---

## 8. Files

| Area | Files |
|---|---|
| Schema | `lib/db/schema/record-confirmations.ts`, `drizzle/0043_add_record_confirmations.sql`, `DB-SCHEMA.md` |
| Logic | `lib/confirmations/email-match.ts`, `record.ts`, `store.ts` (+ tests) |
| API | `app/api/v1/confirmations/[slug]/route.ts`, `middleware.ts` |
| UI | `components/confirmations/ConfirmRecordAction.tsx`, `ConfirmRecordPanel.tsx`, utility page |
