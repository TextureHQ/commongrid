# CommonGrid: Record Confirmations

## Product Requirements Document (PRD)

**Version:** 0.1
**Author:** _TBD_
**Date:** November 10, 2026
**Status:** Draft RFC
**ERD:** `docs/specs/record-confirmations-erd.md`

---

## 1. Executive Summary

CommonGrid's most distinctive data is the part no national source publishes: co-op programs and the links between
distribution co-ops and their generation-and-transmission (G&T) suppliers. It was built by hand from roughly 850 co-op
websites. Nothing keeps it true. Today a field only gets a human timestamp as a side effect of an approved edit, so
there is no way to say "this is still correct."

This RFC proposes **record confirmations**: someone at a utility, signed in with a verified work email at that
utility's domain, can confirm in under a minute, on a phone, that what CommonGrid lists for them is still right. A
confirmation never changes the record. It adds a dated, attributed event, shown publicly beside the field it
covers as **"Confirmed by 4-County Electric Power Association staff · Nov 10, 2026."**

It ships in three independent cuts. Cut 1 is a small PR; cuts 2 and 3 are described here and built only if cut 1 is
welcome.

---

## 2. Goals & Non-Goals

### Goals

- Let utility staff confirm their record without editing it.
- Make the confirmer the citation: a confirmation has no source URL, so who confirmed it (which utility) and when is
  the provenance.
- Create **no new moderator work**.
- Work on a phone, from one plain link per utility that outreach can send.
- Stay additive: no changes to the contribution, moderation, or sync systems.

### Non-Goals

- Anonymous confirmations. Like contributions, confirming needs sign-in.
- Confirming EIA-sourced figures (customers, revenue, sales, peak demand). EIA is already their citation.
- A record-level freshness indicator, or anything shown on unconfirmed fields, in cut 1 (see §6).
- Withdrawing a confirmation (a question for maintainers, §9).
- Making the G&T link community-editable (a question for maintainers, §9).

---

## 3. Current State (as of November 9, 2026)

| Fact | Figure |
|---|---|
| Programs with a field a moderator has approved | 12 of 676 |
| Distribution co-ops with no G&T supplier recorded | 196 of 835 |
| Community submissions ever, all entity types | 40 (Aug 17 – Oct 27) |
| Co-ops with `utilities.domains` filled in (sample of 100) | 97 |

Records already carry a public badge (`EntityProvenanceBadges`): "Community-verified" when the latest version came from
a person, otherwise "Needs verification / help us fill this in." Most records show the second.

---

## 4. Cut 1 — Confirm current (this PR)

### 4.1 Who can confirm

Anyone signed in whose **Clerk-verified primary email** is at one of the utility's domains (`utilities.domains`, plus
the host of `utilities.website`), including subdomains. Personal providers (Gmail, Outlook, …) and shared website
hosts (Facebook, Wix, …) never match. `users.affiliation` (free text) is not used.

Everyone else sees why they can't confirm and a link to Suggest Edit. Nothing is stored for them, so nothing needs
review.

### 4.2 What can be confirmed

| Row | Shown for | Value confirmed |
|---|---|---|
| Website | Every utility | `utilities.website` |
| Power supplier | Distribution co-ops | `utilities.generation_provider_id` (shown by name) |
| Each program the utility runs | Utilities with programs | `programs.status` ("Active", "Coming soon", …) |

These are the things a utility knows first-hand. A blank value can't be confirmed; it is listed as missing.

### 4.3 Entry points

- **On the utility page:** a "Work here? Confirm this record" link on its own line under the page header. The
  header's button row has no room left on phones.
- **Shareable link:** `/grid-operators/{slug}?confirm=true` opens the drawer, the way `?edit=true` opens Suggest
  Edit. Unlike Suggest Edit, it opens for signed-out visitors too, with a sign-in prompt, because outreach links will
  usually reach people who aren't signed in.

### 4.4 The flow (modelled on Suggest Edit's `EditEntityPanel`)

1. **Drawer:** "Here's what CommonGrid lists for {utility}. Mark anything that's wrong, then confirm the rest." Each
   row shows its value, or "Missing," and when it was last confirmed. Rows have a "Something's wrong" link; marking
   a row leaves it out of the confirmation.
2. **Dialog (replaces the drawer):** the rows being confirmed, and exactly what will appear publicly beside each:
   "Confirmed by {utility} staff · {date}. Your name and email won't be shown."
3. **Drawer again:** a thank-you, then a follow-up for each wrong or missing row:
   - **Website** → opens Suggest Edit.
   - **Program** → links to the program, where Suggest Edit lives.
   - **Power supplier** → a short text box that starts a discussion thread on the utility, because the field isn't
     community-editable (§9).

### 4.5 What is shown, and where

"Confirmed by {utility short name, else name} staff · {date}." The utility, not the person, because the email check
establishes affiliation, not identity, and the site doesn't show contributor names elsewhere. "Staff," because someone
who works there said it; the utility did not issue it. Who confirmed it is stored for maintainers.

The line appears on public pages, beside the one field it covers:

| Field | Where | Wording |
|---|---|---|
| Website | Utility page, directly under the WEBSITE row in Overview | Confirmed by {utility} staff · {date} |
| Power supplier | Utility page, in the "Generation Provider" card | Confirmed by {utility} staff · {date} |
| Program status | Utility page, under the program's row in Programs | Status confirmed by {utility} staff · {date} |
| Program status | Explore, program panel, under the status | Status confirmed by {utility} staff · {date} |

Program rows say "Status confirmed" because the line sits beside a whole program, and only its status was confirmed.

Rules:

- **Per field.** A confirmation covers one field. It never speaks for the whole record or for EIA-sourced figures,
  and nothing is added to the page header.
- **Only where there is one.** A field with no confirmation shows nothing: no "unconfirmed" or "never checked."
- **Only while it's still true.** A confirmation applies while the field holds the value that was confirmed. Once
  the value changes, the line is gone. The page also checks the confirmed value against the value it is displaying,
  so a cached response can't put the line beside a different value.
- **Read-only.** The lines come from a public endpoint (`GET /api/v1/utilities/{slug}/confirmations`). Displaying them
  changes nothing in editing, moderation, or sync.
- **Beside the existing badge, not instead of it.** The header's "Needs verification" badge is about the whole
  record and is left alone (§5, §9).

### 4.6 Moderator load

Zero. Confirmations only come from matching emails and never change data. Corrections go through Suggest Edit, into
the existing queue, where they would have gone anyway.

### 4.7 Risk

Showing the line publicly changes what a confirmation is. Before, only the person confirming saw it. Now:

- **One employee makes a public statement in the utility's name.** Anyone with a verified mailbox at the utility's
  domain can put "Confirmed by {utility} staff" on a public page. The utility as an organisation has not approved
  it, and the person may be wrong.
- **Nobody reviews it.** There is no moderator step. That is the point of the feature, and also its risk.
- **It can't be taken back.** There is no way for the person, the utility, or a moderator to withdraw a
  confirmation in the product. Today that takes a maintainer deleting the row. The line does disappear by itself
  when the field's value changes.

What limits the damage: a confirmation can't change any data; it only vouches for a value CommonGrid already
shows; it covers one field; it is dated; and the wording says "staff." A wrong confirmation makes one existing
value look more trustworthy than it is, until someone corrects the value.

---

## 5. Edge Cases

| Case | Behaviour |
|---|---|
| Staff who only use a personal email | Can't confirm; can suggest edits. Outreach should ask for a work email. |
| Parent-company or association domains shared by several utilities (e.g. one holding company's subsidiaries) | Staff at that domain can confirm each. Acceptable: they speak for the group. |
| Malformed website (e.g. `www.snopud-com`) and no `domains` | Nobody matches until the website is fixed. |
| Value edited after confirmation | The confirmation stops applying and the public line disappears. Nothing needs updating. |
| Record shows "Needs verification" in the header and "Confirmed by" beside a field | Both are true: the badge is about the whole record, the line about one field. Left as is in cut 1 (§9). |
| Someone confirms by mistake, or leaves the utility | No way to withdraw it in cut 1 (§4.7, §9). |
| A new confirmation, or a changed value | Public pages can lag by a couple of minutes (the endpoint is cached for 60 seconds). A stale line is never shown beside a changed value. |
| Website confirmed with a path (`4county.org/outages`) | The drawer shows the full address. The utility page's Overview shows only the hostname, as it does today, with the line under it; the link still goes to the full address. |
| The utility page showed no "Generation Provider" card for most co-ops | An existing bug: the page looked the supplier up in a list of the first 200 utilities. With no card there was nowhere to show the line, so this change fetches the supplier by id. The parent, transmission provider and successor cards had the same gap and get the same fix. The lists of utilities a supplier serves still come from that list; left alone here. |
| Value changed while the drawer was open | The confirm is refused (409) and the person is asked to reload. |
| Same person confirms the same value again within 24 hours | Skipped. |
| Banned user | Refused, as for contributions. |
| An employee confirms but isn't speaking officially for the utility | The wording says "{utility} staff," not the utility. See §4.7. |

---

## 6. Cut 2 — Freshness of the whole record (described, not built)

Cut 1 shows a line only on fields that have been confirmed. Cut 2 is the record-level view: when a person last
verified anything on the record (a confirmation or an approved edit), and which fields are missing or have never
been checked. Build it for moderators and the contributor queue first. Keep the "never checked" half off public
pages until outreach has produced real confirmations, so most pages don't lead with a negative. This is also where
the existing "Needs verification" badge would be replaced or reworded (§9).

---

## 7. Cut 3 — Contributor queue (described, not built)

A page listing records by state, sorted by how stale they are and what's missing, with the G&T link called out for
co-ops. It gives contributors and outreach a worklist.

---

## 8. Success Metrics

- Share of outreach links that end in at least one confirmation.
- Median time from opening the drawer to confirming (target: under a minute).
- Co-ops with a confirmed power supplier.
- Corrections handed off to Suggest Edit that are approved.

---

## 9. Questions for Maintainers

1. **Make `generation_provider_id` community-editable?** Today "Power supplier is wrong" can only start a discussion
   thread.
2. **Show discussion threads somewhere?** The API exists, but no page displays threads yet, so those reports are only
   visible through the API.
3. **Let Suggest Edit open on one field** (e.g. `?edit=website`), so a handoff lands on the field that's wrong.
4. **Is "Confirmed by {utility} staff" acceptable on public pages**, with only the domain check behind it and no
   review (§4.7)? If not, cut 1 can go back to showing it only inside the drawer.
5. **What should happen to `EntityProvenanceBadges`?** Cut 1 leaves it alone, so a page can say "Needs
   verification" in the header and "Confirmed by" beside a field. Cut 2 could replace it.
6. **Should people be able to withdraw their own confirmation?** Not built: it needs a second write path, a
   "you confirmed this" state in the drawer, and a decision between deleting the row and marking it withdrawn
   (the table is append-only so that earlier confirmers are kept). Roughly 150 lines. Until then, removal is a
   maintainer deleting the row.
