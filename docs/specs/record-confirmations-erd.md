# CommonGrid: Record Confirmations — ERD & Technical Spec

## Technical Specification — Entity Relationship Design

**Version:** 0.1
**Author:** _TBD_
**Date:** November 10, 2026
**Status:** Draft RFC
**PRD Reference:** `docs/specs/record-confirmations-prd.md`

---

## 1. Executive Summary

One new append-only table, `record_confirmations`; one signed-in app API to confirm
(`/api/v1/confirmations/{slug}`); one public read-only endpoint (`/api/v1/utilities/{slug}/confirmations`); a drawer
on utility pages; and a "Confirmed by {utility} staff · {date}" line beside each confirmed field on public pages. No
changes to existing tables, the contribution or moderation flow, or sync.

### Design Principles

1. **Additive only.** One new table. Edits to existing files: the utility page (the entry point and three places the
   line is shown), the Explore program panel (one place), `EntityList` (an optional second line), one middleware path,
   one OpenAPI-check exclusion, and one new entry in the public OpenAPI spec.
2. **A confirmation never changes the record.** It writes nothing to entity tables, `entity_versions`, or
   `field_moderation_state`.
3. **The confirmer is the citation.** Each row records which utility domain matched, who, and when.
4. **No new review states.** Rows are only written for a verified, matching email.
5. **Display is per field and read-only.** A line appears only beside a field whose current value was confirmed.

---

## 2. Entity Relationship Diagram (Textual)

```
record_confirmations >── 0..1 users   (user_id: foreign key, ON DELETE SET NULL)

record_confirmations.utility_id                 → utilities.id                  (no foreign key)
record_confirmations.(entity_type, entity_id)   → utilities.id | programs.id    (polymorphic, as entity_versions)
```

Only `user_id` is a foreign key. Like `entity_versions.entity_id`, `utility_id` and `entity_id` carry no constraint.

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

The two `/api/v1/confirmations` routes are app surface (like `/api/v1/contributions`): listed in
`isClerkProtectedApiPath` in `middleware.ts`, and excluded from the public OpenAPI coverage check. The third route is
public data and is in the OpenAPI spec.

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

### `GET /api/v1/utilities/{slug}/confirmations` (public)

No sign-in. What public pages read to show the line. Returns
`{ confirmedBy, confirmations: [{ entityType, entityId, fieldName, value, confirmedAt, programSlug? }] }`.

- Lists only fields whose **current** value was confirmed (the same `buildRows` rule as the drawer). A field never
  confirmed, or changed since, is absent.
- `confirmedBy` is the utility's short name, else its name. Nothing about the person: no user id, name, email, or
  `email_domain`.
- `value` is returned so the page can refuse to show the line beside any other value (`confirmationFor` in
  `lib/confirmations/record.ts`).
- `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`. `404` for an unknown utility.
- When the drawer saves, the utility page fetches this again with `cache: "reload"`. Without that, the browser
  serves its earlier "nothing confirmed" copy and the person doesn't see their own line until a second reload.

A program's line is read from the utility that runs it, so the Explore panel calls this once per administering
utility.

---

## 5. Clerk Integration

The email check reads Clerk's server-side user (`currentUser()`) and uses `primaryEmailAddress` only when
`verification.status === "verified"`. It does not use `users.email`: when a user row is created on first request
(`ensureUserSynced`), that column is filled from `emailAddresses[0]`, which may not be the verified primary address.

Domain matching (`lib/confirmations/email-match.ts`): equal to a utility domain or a subdomain of it, never a parent
domain; personal email providers and shared website hosts never match.

---

## 6. Security Considerations

### The risk of showing it publicly

A confirmation is now a public statement, not a private acknowledgement:

- **One employee speaks in the utility's name.** Any verified mailbox at the utility's domain can put "Confirmed by
  {utility} staff" on a public page. The utility has not approved it, and the person may be wrong.
- **There is no review.** Nothing sits between the click and the public page.
- **There is no retraction.** The table is append-only and has no withdraw path; neither the person, the utility,
  nor a moderator can remove a confirmation in the product. Removal is a maintainer deleting the row. Letting people
  withdraw their own was sized at roughly 150 lines plus a delete-or-mark decision, and is left as PRD §9 question 6.

What bounds it: a confirmation cannot change data; it vouches only for a value already shown; it covers one field;
it is dated; the wording says "staff"; and it stops showing as soon as the value changes.

### Controls

- **Spoofing affiliation** requires controlling a mailbox at the utility's domain that Clerk has verified.
- **Stale or forged values:** the server compares each submitted value with the stored one; mismatches get a 409.
- **Stale display:** the public endpoint omits confirmations of a previous value, and the page compares the
  confirmed value with the one it displays, so caching can't pair the line with a changed value.
- **Scope:** only fields in §3.1 for this utility and its programs; anything else is a 400. The line is shown per
  field and never in the page header, so it can't read as covering the whole record or EIA figures.
- **Privacy:** names and emails are not shown, and the public endpoint does not return `user_id` or `email_domain`.
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
| API | `app/api/v1/confirmations/[slug]/route.ts`, `app/api/v1/utilities/[slug]/confirmations/route.ts`, `middleware.ts`, `scripts/openapi/endpoints.ts` |
| UI | `components/confirmations/ConfirmRecordAction.tsx`, `ConfirmRecordPanel.tsx`, `ConfirmedBy.tsx`, utility page, `components/explorer/panels/ProgramDetailPanel.tsx`, `components/entity/EntityList.tsx` |
