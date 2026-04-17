# CommonGrid: Community Contributions & Developer API Registration

## Product Requirements Document (PRD)

**Version:** 2.0
**Author:** Meridian
**Date:** April 16, 2026
**Status:** Expert Panel Review — Round 2

---

## 1. Executive Summary

CommonGrid is the open registry of US energy infrastructure. Today it serves ~160k entities across 9 entity types, with data sourced from authoritative government datasets (EIA, HIFLD, AFDC). The data is browseable on commongrid.info and queryable via a REST API at `/api/v1/*`.

This PRD covers two interrelated features:

1. **Community Contribution System** — enabling anyone to add, edit, or correct data through a moderated contribution workflow (inspired by Wikipedia and OpenStreetMap)
2. **Developer API Registration** — self-service API key provisioning with tiered rate limits, usage dashboards, and developer tools

Together, these features transform CommonGrid from a read-only reference dataset into a living, community-maintained registry with a developer ecosystem around it.

---

## 2. Goals & Non-Goals

### Goals
- Enable community corrections and additions to improve data coverage and accuracy
- Maintain data quality through a moderation system with clear editorial standards
- Provide a frictionless developer registration flow for API access
- Give developers visibility into their API usage
- Build trust through transparency: every change is attributed, versioned, and auditable

### Non-Goals
- Paid API tiers or monetization (all access is free)
- Real-time collaborative editing (contributions are asynchronous)
- Community-elected moderators in V1 (admin-appointed; governance roadmap in §10)
- Mobile-native editing apps

---

## 3. Feature 1: Community Contribution System

### 3.1 User Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Anonymous Visitor** | Not logged in | Browse, search, view data and edit history. Cannot contribute. |
| **Contributor** | Logged in via GitHub or email | Propose edits, add new entities, comment on discussions, follow entities, view own contribution dashboard |
| **Trusted Contributor** | Promoted by moderator after proven track record | Edits to non-critical fields auto-approved. New entities and geometry still require review. |
| **Moderator** | Appointed by admin | Review queue, approve/return/request changes, revert edits, lock entities, manage contributors, internal notes |
| **Admin** | Texture team | All moderator powers + manage moderators, configure auto-approval rules, view audit logs, manage system settings |

### 3.2 Authentication

**Sign-in options:**
- **GitHub OAuth** (primary) — natural fit for open-source contributors and developers
- **Email magic link** — for non-developers, energy researchers, utility employees

**Sign-in UI:**
- A "Sign In" button appears in the top-right of the navigation bar (currently shows: Explore, Changelog, About)
- Clicking opens a centered modal with two options: "Continue with GitHub" and "Continue with email"
- For email: user enters address → receives a magic link → clicking it signs them in and sets a session cookie
- After sign-in, the button becomes an avatar/initials dropdown with: My Contributions, Developer Dashboard (if applicable), Following, Settings, Sign Out

**Profile setup (first sign-in only):**
- Display name (pre-filled from GitHub if available)
- Optional: affiliation (e.g., "Pacific Gas & Electric", "NREL", "Independent researcher")
- Optional: bio (one line)
- These appear on contribution attribution: "Edited by Jane Smith (NREL)"

### 3.3 The Edit Experience

#### 3.3.1 Entry Point: The "Suggest Edit" Button

Every entity detail page (utility, power plant, EV station, pricing node, etc.) gains a persistent **"Suggest Edit"** button in the page header, next to the entity title. It uses a pencil icon and is visible to everyone but grayed out for anonymous visitors with a tooltip: "Sign in to suggest edits."

Adjacent to it: a **"History"** button (clock icon) that opens the entity's version history timeline.

For signed-in users, clicking "Suggest Edit" opens the **Edit Panel**.

#### 3.3.2 Edit Panel — Attribute Editing

For **attribute-only edits** (the common case), a right-side slide-over panel (420px wide on desktop, full-screen on mobile):

**Header:**
- Entity name and type (e.g., "Pacific Gas & Electric · Utility")
- "Cancel" (X) button top-right

**Source Citation Bar (top of body, sticky):**
- "Default source for this edit" — a source input that applies to all changed fields
- Source type dropdown: "EIA Filing", "Utility Website", "State PUC Filing", "SEC Filing (10-K/10-Q)", "FERC Filing", "News Article", "Academic Paper / Report", "Government Database", "Personal Observation / Site Visit", "Other"
- Free-text URL or reference field
- Date of source (optional, important for filings)
- Per-field override: individual fields can specify a different source if needed (toggle "Use a different source for this field")

**Body — Field-by-Field Editing:**

Fields are organized into collapsible sections matching the entity's data structure. For a **Utility**, sections might be:
- **Basic Info:** Name, EIA ID, state, type (IOU/Coop/Municipal/Federal)
- **Contact:** Website, phone, address
- **Service Territory:** Number of customers by segment, revenue
- **Relationships:** Parent company, associated balancing authority, ISO/RTO
- **Tags:** Freeform tags for community metadata (e.g., "under-construction", "temporarily-offline", "renewable-focused")

Each field shows:
- Current value (read-only, gray background)
- Data source indicator: small badge showing origin ("EIA-861" or "Community" or "HIFLD")
- An "Edit" pencil icon next to each field
- Clicking "Edit" makes the field editable with an inline input
- Changed fields get a blue left-border highlight and show the old value struck through above the new value (visual diff)
- If using a per-field source override, a small source badge appears next to the field

**Edit Summary (bottom, above submit):**
- Text area: "Describe your changes"
- Minimum 25 characters
- Placeholder: "e.g., Updated customer count and revenue from PG&E's 2025 10-K SEC filing, page 47"
- Below the placeholder: a collapsible "Examples of good edit summaries" with 3 examples

**Action buttons (bottom-sticky):**
- "Preview Changes" (secondary) — shows a preview of the entity with changes applied
- "Submit for Review" (primary) — disabled until all requirements met (edit summary, source citation)

#### 3.3.3 Edit Panel — Geometry Editing (Full-Screen Mode)

For entities with spatial data, clicking "Edit Location" or "Edit Boundary" in the edit panel transitions to a **full-screen split-view editor**:

**Left side (60% width): Map**
- Mapbox GL JS map centered on the entity
- Satellite/aerial imagery layer toggle (essential for verifying locations)
- For **point entities** (power plants, EV stations): Click to place/move pin, or enter lat/lng manually in a sidebar input
- For **polygon entities** (territories): Draw tool with vertex editing, snap-to-existing-boundary support
- "Before" ghost overlay: semi-transparent original position/boundary shown alongside the proposed change
- Zoom/pan controls, measurement tool (distance, area)

**Right side (40% width): Edit details**
- Attribute fields (same as slide-over mode)
- Source citation
- Geometry change summary: "Moved 0.3 km northeast" or "Added 12 vertices, increased area by 2.1 km²"

**Note:** Line entities (transmission lines) are not community-editable in Phase 1 — too complex and sourced from HIFLD.

#### 3.3.4 Multi-Entity Changesets

Contributors often need to make related edits across multiple entities (e.g., updating 5 EV stations at the same location, or correcting utility data across subsidiaries).

**Flow:**
- After submitting an edit, a toast offers: "Make another related edit?" → opens a new edit panel with the changeset context carried over
- All edits in a session can be grouped into a **changeset** with a shared description
- In the moderation queue, changesets appear as a single reviewable unit with an expandable list of individual changes
- Moderators can approve/return the entire changeset or individual edits within it

#### 3.3.5 Adding a New Entity

From any entity list page (e.g., `/power-plants`, `/ev-charging`), a **"+ Add New"** button appears in the toolbar for signed-in users.

Clicking opens a **full-page form** (new entities need more space):
- Entity type is pre-selected based on the current page
- **Guided form with progressive disclosure:** required fields shown first, optional fields in expandable sections
- Required fields clearly marked with asterisks and inline validation
- For entities with geometry: integrated map for pin-drop or polygon drawing (same as geometry editor, §3.3.3)
- Source citation required for the entity as a whole
- **Preview before submit:** full-page preview showing exactly how the entity will appear on CommonGrid
- **Duplicate detection:** When key fields are filled in (name, location, EIA ID), the system checks for existing matches and warns: "We found a similar entity: [name]. Is this a duplicate?" with options to "Edit existing instead" or "This is different, continue"

#### 3.3.6 Submission Flow

1. User clicks "Submit for Review"
2. Confirmation dialog: "Your changes will be reviewed by a moderator. You'll be notified when they're approved or if changes are requested. Average review time: ~24 hours."
3. On confirm: the contribution is saved as a **pending changeset** (stored in DB, not applied to the live entity)
4. User sees a success toast: "Contribution submitted! Track it in My Contributions."
5. The entity detail page shows a subtle banner: "You have a pending edit for this entity" with a link to view it

#### 3.3.7 Conflict Handling

**Same entity, overlapping edits:**
- When a user opens the edit panel, the system records the entity's current version number
- On submit, if the version has changed (another edit was approved in the meantime), the user sees a **merge screen**:
  - Three-column comparison: "Your changes" | "Current version" | "Version when you started editing"
  - Per-field resolution: for each conflicting field, choose "Keep mine" or "Accept current"
  - Non-conflicting fields auto-merge
- If the same field has two pending contributions from different users, the moderator sees both and decides which to accept (or synthesizes them)

### 3.4 Entity Discussion Threads

Every entity has a **"Discussion" tab** (alongside the existing detail content and the new "History" tab):

- Threaded comment system (similar to GitHub issues)
- Any signed-in user can post
- Use cases: "This EV station is permanently closed," "The capacity figure seems wrong — can anyone verify?", "I think this utility merged with [other utility]"
- Moderators can pin important comments and close threads
- Discussion threads are linkable from contribution reviews — moderators can say "See discussion: [link]"

### 3.5 Entity Following (Watchlist)

Signed-in users can click a "Follow" (star icon) button on any entity detail page to add it to their watchlist.

**Following means:**
- Notification when the entity is edited (community or official sync)
- Notification when someone posts in the entity's discussion thread
- Followed entities appear in a "Following" section accessible from the avatar dropdown

**Notification preferences (granular):**
- "All changes" vs. "Major changes only" (filtering out minor corrections)
- "Discussion activity" (on/off)
- Delivery: in-app only, email digest (daily/weekly), or immediate email

### 3.6 Contributor Dashboard

Accessible from the avatar dropdown → "My Contributions" or at `/contributions`.

**Layout:** Full-page with a left sidebar and main content area.

**Left sidebar filters:**
- Status: All, Pending Review, Approved, Returned, Changes Requested
- Entity type: All, Utilities, Power Plants, EV Stations, etc.
- Date range

**Main content:**

#### 3.6.1 Contribution List
- Table with columns: Entity Name, Entity Type, Status, Submitted, Last Updated
- Status badges: 🟡 Pending Review, 🟢 Approved, 🟠 Returned, 🔵 Changes Requested
- Click any row to expand and see:
  - The full diff of proposed changes
  - Moderator comments (if any)
  - Timeline: submitted → reviewed → approved/returned
  - If "Changes Requested": an "Update Submission" button that reopens the edit panel with their changes pre-filled
  - If "Returned" (rejected): moderator's explanation, guidance on how to improve, and an "Appeal" button

#### 3.6.2 Appeal Mechanism
When a contribution is returned (rejected):
- The contributor sees the moderator's reason and can click "Appeal"
- Appeal opens a text field: "Why do you think this change should be reconsidered?"
- The appeal goes to a different moderator (not the one who originally returned it) or to an admin
- Appeal statuses: Under Review, Upheld (original decision stands), Overturned (edit approved)

#### 3.6.3 Statistics
- Total contributions, approval rate, average review time
- Contribution streak ("5 contributions this month")
- Entity types contributed to (visual breakdown)
- "Trusted Contributor" progress indicator: "8 of 25 approved contributions toward Trusted status"

#### 3.6.4 First-Time Contributor Onboarding

The first time a user visits the Contributor Dashboard (or clicks "Suggest Edit" for the first time):

- A brief **guided tour** (3-4 tooltip steps):
  1. "This is where you edit — click the pencil icon next to any field"
  2. "Always cite your source — this helps moderators verify your changes"
  3. "Write a clear edit summary — explain what you changed and why"
  4. "You'll be notified when your edit is reviewed. Average turnaround: ~24 hours"
- An "Editing Guidelines" page linked from the dashboard explaining:
  - What makes a good contribution
  - Accepted source types
  - Common rejection reasons and how to avoid them
  - Example of an ideal contribution (annotated screenshot)

### 3.7 Notifications System

**In-app notification bell** (top nav, next to avatar):
- Dropdown showing recent notifications
- "Mark all as read" button
- "View all" link → full notifications page

**Notification types for contributors:**
- "Your edit to [entity] was approved ✅"
- "Your edit to [entity] was returned — [moderator snippet]. View details."
- "Changes requested on your edit to [entity] — [moderator snippet]"
- "Your new entity [name] was approved and is now live"
- "[Entity you follow] was updated by [contributor]"
- "New discussion on [entity you follow]"
- "Your appeal was [upheld/overturned]"

**Notification preferences (Settings → Notifications):**
- Per-type toggles:
  - Contribution status changes: In-app / Email (immediate) / Email (daily digest) / Off
  - Followed entity changes: In-app / Email (daily digest) / Email (weekly digest) / Off
  - Discussion activity: In-app / Email (daily digest) / Off
- Global: "Pause all email notifications" toggle

### 3.8 Moderation System

#### 3.8.1 Moderation Queue (`/mod/queue`)

Accessible only to moderators and admins. Appears as "Mod Queue" in the nav with a live badge count.

**Queue layout — three sections:**

1. **Flagged** (red accent) — auto-flagged contributions needing careful review
2. **Pending** (yellow accent) — normal contributions awaiting review
3. **Deferred** (gray) — items explicitly set aside for later

**Filters:**
- Entity type
- Contributor (specific user or trust level)
- Date range
- Geographic region (state/ISO territory)
- Priority (auto-set: new entities > field edits, flagged > normal)

**Sorting:** Oldest first (default), newest, priority, entity type

**Each queue item shows:**
- Contributor name + avatar + trust level badge
- Entity being edited (linked) + entity type icon
- Auto-generated summary: "Updated 3 fields on Pacific Gas & Electric"
- Time in queue (with color coding: green < 24h, yellow 24-48h, red > 48h)
- Flag indicators (if any): ⚠️ New account, ⚠️ Large numeric change, ⚠️ Similar to banned user pattern

**Moderator preferences:**
- Moderators can set their preferred entity types and geographic regions
- Queue auto-sorts to prioritize items matching their expertise
- Unmatched items still appear but are deprioritized

#### 3.8.2 Moderator Review Screen

Clicking a queue item opens the full review screen:

**Top bar:**
- Entity name + type + link to live page
- Contributor info: name, affiliation, contribution count, approval rate, account age
- "View contributor profile" link

**Main content — Tabbed view:**

**Tab 1: Changes**
- Field-by-field diff with old/new values highlighted (red/green)
- Source citations shown inline next to each changed field
- For each field: current authoritative source value (if known) shown as a reference point

**Tab 2: Map** (for entities with geometry)
- Full-width map showing the entity's location
- If geometry changed: "before" (red) and "after" (green) overlay
- Satellite imagery toggle
- Context: nearby entities of the same type shown for reference

**Tab 3: Discussion**
- Entity's discussion thread (if any active conversations)

**Tab 4: Contributor History**
- This contributor's recent edits (last 20)
- Their approval rate and any moderator notes

**Moderator action buttons (bottom-sticky toolbar):**
- ✅ **Approve** — applies changes to the live entity, creates a new version. Optional comment.
- 🔄 **Request Changes** — with required comment. Contributor is notified.
- ↩️ **Return** — with required comment (reason for not applying). Contributor is notified with guidance.
- ⏸️ **Defer** — move to back of queue with optional internal note.
- 🔒 **Approve & Lock Entity** — approve the edit and protect the entity from further community edits (see §3.8.5).

**Quick action templates (for common return reasons):**
- "Source not verifiable — please provide a direct link to the source document"
- "Data appears outdated — please check the latest filing"
- "Duplicate of existing entity [link]"
- "Spam/vandalism" (auto-flags contributor, increments strike count)

**Internal moderator notes:**
- Text field for notes visible only to other moderators and admins
- "This contributor seems to be adding real data but citing sources poorly — worth coaching"
- Notes persist on the contributor's profile

#### 3.8.3 Entity History Page

Every entity gains a **"History" tab** showing its full version timeline:

- Chronological list of all versions (newest first)
- Each version shows: version number, who changed it, when, change type (sync/community/admin), change summary
- Expandable diff for each version
- Source attribution: "From EIA-860 annual sync" or "Community contribution by Jane Smith"
- **"View at this version"** — opens the entity frozen at that point in time
- **"Revert to this version"** (moderators only) — creates a new version that restores the entity to the selected state, with audit trail
- **"Compare versions"** — select any two versions and see a side-by-side diff

#### 3.8.4 Contributor Management (`/mod/contributors`)

A table of all contributors with:
- Username, affiliation, sign-up date
- Contribution count, approval rate
- Trust level (Contributor / Trusted / Banned)
- Last active date
- Moderator notes (internal)

**Actions:**
- Promote to Trusted Contributor
- Demote from Trusted to regular
- Temporary ban (with duration and reason)
- Permanent ban (with reason)
- View full contribution history
- **Batch revert:** "Revert all contributions by this user" — opens a confirmation screen showing all edits that would be reverted, with checkboxes to include/exclude individual edits

#### 3.8.5 Entity Protection (Locking)

Moderators can lock entities at two levels:

- **Semi-locked:** Only Trusted Contributors, moderators, and admins can edit. Regular contributors can still suggest edits but they go through an additional review step.
- **Fully locked:** Only moderators and admins can edit. Useful for highly contested entities or during active data disputes.

Lock indicators:
- Locked entities show a 🔒 icon next to the title
- The "Suggest Edit" button on a fully locked entity says "This entity is currently locked" with a link to the discussion thread explaining why
- Semi-locked entities show: "This entity has additional review requirements. Your edit will receive extra scrutiny."

#### 3.8.6 Anti-Spam & Vandalism

**Rate limiting on submissions:**
- New accounts (< 7 days): max 5 contributions per day
- Regular accounts: max 30 contributions per day
- Trusted: max 100 contributions per day

**Automated flags** (items appear in the "Flagged" section of the queue):
- Account age < 24 hours
- Large numeric changes (>50% delta on numeric fields)
- Deviation from authoritative baseline (if the changed value differs significantly from the last official sync value)
- Multiple edits to the same entity in quick succession
- Edits to locked or previously-reverted entities
- Text patterns: URLs in name fields, gibberish detection, profanity filter
- **Behavioral signals:** New account that immediately edits entities recently touched by a banned user

**Automated rejection** (not applied, contributor notified):
- Obvious spam patterns (commercial URLs, promotional text)
- Exceeding submission rate limits

**First 5 contributions** from any new account always require moderator review, regardless of field type.

#### 3.8.7 Auto-Approval Rules (Trusted Contributors)

**Promotion criteria (all must be met):**
- 25+ approved contributions
- 0 returned contributions in last 20 edits
- Contributions span at least 3 different entity types
- Account age ≥ 30 days
- No active warnings or bans

**Auto-approved edits (Trusted Contributors only):**
- Contact info changes: website, phone, address
- Freeform tags
- Minor corrections: typos, formatting

**Always requires review (even for Trusted):**
- Numeric data: capacity, customer counts, revenue
- New entities
- Geometry changes
- Relationship changes (parent company, ISO/RTO assignment)
- Changes to "critical fields" as defined per entity type

Auto-approved changes appear in the moderation log for auditability, with a filter to view only auto-approved edits.

#### 3.8.8 Moderator Audit Log

All moderator actions are logged:
- Who performed the action
- What action (approve, return, request changes, ban, revert, lock, etc.)
- When
- On which contribution/entity/contributor
- Any comments or notes

Accessible to admins at `/mod/audit-log`. Filterable by moderator, action type, date range.

#### 3.8.9 Moderator Notifications

- Live badge count on "Mod Queue" nav item
- **Daily email digest:** "[count] contributions pending review. [count] flagged. Oldest item: [age]. Review: [link]"
- **Urgent alerts** (immediate email):
  - Spam wave detected (>10 flagged contributions in 1 hour)
  - Contributor ban appeal submitted
- **Slack webhook** (configurable): post to a channel when new contributions arrive or are flagged

### 3.9 Official Sync vs. Community Data

**When official data syncs (EIA, HIFLD, AFDC) update a field:**
- Official values take precedence by default
- If the field was community-edited since the last sync, a "conflict" is flagged for moderator review
- Moderator can choose: accept official value (default), keep community value (with a "community override" flag), or merge
- The contributor who made the community edit is notified: "Your edit to [field] on [entity] has been flagged for review due to an official data update from [source]"
- Community overrides are logged and can be queried

**Community-contributed entities (not in official datasets):**
- Flagged with `"source": "community"` in the API response
- "Community-contributed" badge on the entity detail page
- If an official sync later matches the entity, records are merged and source is upgraded
- The original contributor is credited in the history

### 3.10 Data Provenance on the Public Page

After approved edits, entity pages show:
- Updated values (current data)
- Per-field source indicators: small badge showing data origin
  - 📊 "EIA-860" / "HIFLD" / "AFDC" = official sync
  - 👤 "Community" = community-contributed
  - Hovering the badge shows: "Last updated by [contributor], [date], source: [citation]"
- In the "History" tab: full version timeline with attribution

---

## 4. Feature 2: Developer API Registration & Rate Limiting

### 4.1 Rate Limiting Tiers

| Tier | Authentication | Rate Limit | Burst | Intended Use |
|------|---------------|------------|-------|--------------|
| **Anonymous** | None (IP-based) | 60 requests/hour | 10 req/min | Casual browsing, trying the API |
| **Registered** | API key (header) | 5,000 requests/hour | 100 req/min | Active development, integrations |
| **Bulk** | API key + auto-approval | 50,000 requests/hour | 500 req/min | Data pipelines, research |

**Rate limit headers on every response:**
```
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4832
X-RateLimit-Reset: 1713300000
X-RateLimit-Tier: registered
```

**When rate-limited (429):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "You've exceeded the rate limit. Register for a free API key for higher limits.",
  "retryAfter": 45,
  "docs": "https://commongrid.info/developers",
  "currentTier": "anonymous",
  "currentLimit": 60
}
```

**Approaching limit nudge (at 80% of anonymous tier):**
```
X-CommonGrid-Register: Get higher rate limits for free → https://commongrid.info/developers
```

### 4.2 Developer Registration Flow

#### 4.2.1 Discovery: The CTA

Rate limit CTAs appear in multiple places:
1. **API response headers** on anonymous requests
2. **429 response body** with registration link
3. **API docs page** with prominent "Get your API key" CTA
4. **Site footer:** "Developers" link
5. **Landing page:** New card in the "Browse the Registry" grid: "API & Developers"
6. **GitHub README:** Developer quickstart section

#### 4.2.2 Developer Landing Page (`/developers`)

**Hero section:**
- Headline: "Build on CommonGrid"
- Subhead: "Free API access to the most comprehensive open dataset of US energy infrastructure. Register for an API key to unlock higher rate limits and usage analytics."
- Primary CTA: "Get Your API Key" (opens auth flow if not signed in, or scrolls to form)
- Secondary CTA: "Read the Docs"

**Feature showcase (below hero):**
- Cards showing what you can build: grid analytics, utility territory lookup, power plant dashboards, EV charging locators
- Code snippets showing how simple the API is (curl + JS examples)

**Stats:** "Serving X developers, Y million requests/month" (once data exists)

#### 4.2.3 API Key Creation Flow

**If not signed in:** sign-in modal first (same auth as contributions — GitHub or email).

**Registration form (one step):**
- **App name** (required): "What are you building?" — placeholder: "My Grid Analytics Tool"
- **App URL** (optional): Link to your project or company
- **Use case** (required, dropdown): "Research / Academic", "Commercial Application", "Personal Project", "Open Source Tool", "Government / Non-profit", "Data Journalism", "Other"
- **Description** (required, 2-3 sentences): "Briefly describe how you'll use CommonGrid data"
- **Agree to terms:** Checkbox for acceptable use policy (no scraping beyond rate limits, attribute CommonGrid, respect ODbL license)

**Key creation success screen:**
- The API key is displayed **once** in a prominent, copy-friendly box:
  ```
  cg_a1b2c3d4-e5f6-7890-abcd-ef1234567890
  ```
- ⚠️ Warning: "This is the only time your full key will be shown. Copy it now and store it securely."
- "Copy to Clipboard" button (with checkmark confirmation)
- **Quick start guide** right on this page:
  ```bash
  curl -H "Authorization: Bearer cg_a1b2c3d4..." \
    https://commongrid.info/api/v1/utilities?state=CA
  ```
- "I've saved my key → Go to Dashboard" button

#### 4.2.4 Key Scoping

When creating a key, developers can optionally set scopes:
- **Read-only** (default): `*:read` — can query all endpoints
- **Read + Contribute**: `*:read, *:write` — can also submit contributions via API
- **Custom**: Select individual entity types and permissions

Scope is shown on the key management page and can be updated (requires confirmation).

### 4.3 Developer Dashboard (`/developers/dashboard`)

Accessible after sign-in for users with at least one API key.

**Layout:** Full-page with tabbed navigation: Overview | API Keys | Usage | Webhooks | Settings

#### 4.3.1 Overview Tab
- **Usage graph:** Line chart showing requests per day over the last 30 days
- **Stats cards:**
  - Total requests (this billing period)
  - Average daily requests
  - Current rate limit tier + "Upgrade to Bulk" CTA if applicable
  - Most-used endpoint
  - P95 response time
- **Quick links:** API docs, changelog, status page
- **API status indicator:** Green/yellow/red dot with "All systems operational" or degradation notice

#### 4.3.2 API Keys Tab
- Table of all keys:
  - Key prefix (e.g., `cg_a1b2c3...`) — identifier
  - Key name (user-assigned, editable)
  - Scopes (badges)
  - Created date
  - Last used date + endpoint
  - Status: Active / Revoked
  - Actions: Revoke, Rename, Edit Scopes
- **"Create New Key"** button (max 10 active keys per personal account)
- **Key rotation guidance:**
  - Tooltip: "To rotate, create a new key, update your application, then revoke the old one. Both keys work simultaneously during the transition."

#### 4.3.3 Usage Tab
- **Detailed usage breakdown:**
  - Requests by endpoint (horizontal bar chart)
  - Requests by day/hour heatmap (GitHub-contribution-graph style)
  - Response codes distribution (200, 304, 400, 404, 429)
  - Top endpoints table with request counts and avg response time
- **By API key:** filter usage by specific key (useful when one key = one project)
- **Export:** CSV download of usage data
- **Usage API:** `GET /api/v1/developer/usage` returns your own usage metrics programmatically

#### 4.3.4 Webhooks Tab (Phase 2 — shown as "Coming Soon")
- Subscribe to entity change events
- Configure webhook URL and secret
- Select entity types and change types (create, update, delete)
- Event delivery log with retry status
- "Coming Soon" badge with email signup for notification when available

#### 4.3.5 Settings Tab
- Update app name, URL, description
- **Email preferences:**
  - Rate limit alerts: "Notify me when I reach 80% of my rate limit" (on/off)
  - Weekly usage summary (on/off)
  - API changelog / breaking changes (on/off, recommended on)
- **Bulk tier request:**
  - If account is 30+ days old and has consistent usage: "Request Bulk Access" button
  - Shows current usage stats to justify the request
  - Auto-approved within 48 hours if usage history is clean; otherwise manual review
  - Status shown: "Pending review" / "Approved" / "Not eligible yet (account must be 30+ days old)"
- **Danger zone:**
  - Delete account (revokes all keys, removes data after 30-day grace period)

### 4.4 Organization Accounts (Phase 2)

**Not in Phase 1, but designed for in the data model:**
- Create an organization (company/team)
- Invite team members (by email)
- Shared API key pool: org keys visible to all members
- Aggregated usage dashboard across all org keys
- Roles: Owner (full admin), Developer (create/revoke own keys, view usage), Viewer (read-only usage)
- If a team member leaves, their personal keys remain personal; org keys stay with the org

**Phase 1 placeholder:** "Team? Contact us for organization access." link in Settings.

### 4.5 API Documentation Page (`/developers/docs`)

**Layout:** Left sidebar navigation (sticky), main content area with endpoint documentation, right sidebar with table of contents for current section.

**Sections:**
1. **Getting Started** — Authentication (header `Authorization: Bearer cg_...`), base URL, response format (JSON), pagination, filtering
2. **Rate Limits** — Explanation of tiers, how to check headers, what to do when limited
3. **Endpoints** — Organized by entity type:
   - Utilities (`GET /api/v1/utilities`, `GET /api/v1/utilities/:slug`)
   - Grid Operators (ISOs, RTOs, Balancing Authorities)
   - Power Plants
   - EV Charging Stations
   - Transmission Lines
   - Pricing Nodes
   - Territories (including reverse geocoding: `/api/v1/territories/lookup?lat=...&lng=...`)
   - Search (`GET /api/v1/search?q=...`)
4. **Entity Versions** — How versioning works, accessing historical data
5. **Contributing via API** — How to submit edits programmatically (Phase 2)
6. **Bulk Access** — How to request bulk tier
7. **Changelog** — API version history
8. **OpenAPI Spec** — Link to `/api/v1/openapi.json` for machine-readable spec

**Each endpoint section includes:**
- URL pattern and HTTP method
- Parameters (query params, path params) in a clean table
- Example request (curl + JavaScript + Python)
- Example response (formatted JSON with syntax highlighting)
- **"Try it"** button: interactive API explorer — enter parameters, see live response (uses the visitor's API key if signed in, or anonymous rate limit)
- Response schema (field names, types, descriptions)

### 4.6 API Status & Reliability

- **Status indicator** in developer dashboard header (green/yellow/red dot)
- **Status page** at `/developers/status` showing:
  - Current API status
  - Response time graph (last 24h)
  - Uptime percentage (last 30 days)
  - Incident history
- Status page linked from: developer dashboard, API docs, 5xx error responses

---

## 5. Information Architecture

### Updated Navigation:
`Explore | Changelog | Developers | About | [Sign In / Avatar]`

**Signed-in avatar dropdown menu:**
- My Contributions (contribution count badge)
- Developer Dashboard (if has API key)
- Following (followed entity count)
- Settings
- Sign Out

**Moderator additions (role-based, visible only to mods/admins):**
- "Mod Queue" with live badge count appears between Changelog and Developers
- Links to `/mod/queue`, `/mod/contributors`, `/mod/audit-log`, `/mod/settings`

### URL Structure:
```
/                           — Landing page (existing)
/explore                    — Map explorer (existing)
/changelog                  — Public changelog (existing)
/about                      — About page (existing)
/sign-in                    — Auth flow (modal, but has a URL for direct linking)
/contributions              — Contributor dashboard
/contributions/:id          — Single contribution detail
/following                  — Followed entities list
/developers                 — Developer landing + registration
/developers/dashboard       — Developer dashboard (keys, usage)
/developers/docs            — API documentation
/developers/status          — API status page
/mod/queue                  — Moderation queue
/mod/contributors           — Contributor management
/mod/audit-log              — Moderator action audit log
/mod/settings               — Auto-approval rules, spam thresholds, etc.
/[entity-type]/[slug]       — Entity detail (enhanced with "Suggest Edit", "History" tab, "Discussion" tab)
/editing-guidelines         — How to contribute effectively
```

---

## 6. Email & Notification Templates

### For Contributors:
1. **Welcome:** "Welcome to CommonGrid! Here's how to make your first contribution." + link to editing guidelines
2. **Contribution approved:** "Your edit to [entity] has been approved and is now live on CommonGrid. [View it →]"
3. **Contribution returned:** "Your edit to [entity] was not applied. [Moderator's detailed reason]. Here's how to improve it: [guidance]. [View & revise →]"
4. **Changes requested:** "A moderator has requested changes to your edit to [entity]. [Comment]. [Update your submission →]"
5. **Entity followed — updated:** "An entity you follow was updated: [entity] — [change summary]. [View →]"
6. **Trusted status earned:** "Congratulations! You've earned Trusted Contributor status on CommonGrid. Some of your edits will now be auto-approved. [Learn more →]"
7. **Appeal resolved:** "Your appeal for [entity] has been [upheld — original decision stands / overturned — your edit has been applied]. [Details →]"

### For Developers:
1. **API key created:** "Your CommonGrid API key is ready. Here's how to get started: [quickstart code]"
2. **Rate limit warning (80%):** "You've used 80% of your hourly rate limit ([current]/[max]). [Tips to optimize →]"
3. **Bulk access approved:** "Your request for bulk API access has been approved. Your new rate limit: 50,000 req/hour."
4. **Weekly usage digest:** "Your CommonGrid API usage this week: [total requests], [top endpoint], [avg response time]"
5. **API changelog:** "CommonGrid API update: [summary]. [Full changelog →]"

### For Moderators:
1. **Daily digest:** "[count] contributions pending review ([count] flagged). Oldest: [age]. [Review queue →]"
2. **Spam wave alert:** "Potential spam detected: [count] flagged contributions in the last hour from [count] accounts. [Review →]"
3. **Appeal filed:** "A contributor has appealed a decision on [entity]. [Review appeal →]"

---

## 7. Edge Cases & Considerations

### Official sync conflicts
- Official syncs take precedence by default
- Community-edited fields flagged for moderator review when a sync updates them
- "Community override" flag for cases where community data is demonstrably better
- Full audit trail of all overrides

### Entities not in official datasets
- Marked with `"source": "community"` in API
- "Community-contributed" badge on the site
- Merged with official data if/when a sync matches them

### Bulk contributions
- Phase 1: individual edits only
- Phase 2: CSV upload with validation, preview, and batch moderation
- Batch contributions grouped in the queue for efficient review

### API key abuse
- Suspicious patterns flagged: sequential scraping of all endpoints, rapid iteration over all entities
- Keys can be revoked by admins with notification to developer
- Revoked-key response includes: `{ "error": "key_revoked", "reason": "...", "contact": "..." }`
- Banned developers cannot create new accounts (email blocking + behavioral signals)

### Contributor sockpuppets
- Behavioral fingerprinting: new accounts that immediately edit entities a recently banned user was editing
- IP-based signals (same IP as banned account, shared patterns)
- Flagged for moderator review, not auto-banned (avoid false positives)

### Two people edit the same entity simultaneously
- Optimistic concurrency via version numbers
- Second submitter sees merge screen with per-field conflict resolution
- Non-conflicting fields auto-merge
- Moderators see both pending edits if neither is resolved yet

### Entity merges/splits
- If Utility A absorbs Utility B, a moderator can merge the entities (carrying history from both)
- If a utility splits, a moderator can create the new entity with a reference to the parent
- These are moderator-only operations, not available to contributors

---

## 8. Success Metrics

### Community Contributions:
- Contributions per week (growth)
- Approval rate (target: >70% — below suggests bad UX or unclear guidelines)
- Average review time (target: <48 hours; <24 hours stretch goal)
- Active contributors per month
- Data coverage improvements: fields filled that were previously empty
- Contributor retention: return contributions after first edit
- Trusted contributor promotions per quarter

### Developer API:
- Registered developers (growth)
- API request volume (total and per tier)
- Conversion rate: anonymous → registered (target: >10% of repeated anonymous users)
- Developer retention: active key usage after 30/60/90 days
- Time to first API call after registration (target: <5 minutes)
- API documentation engagement: page views, "Try it" usage, time on docs
- Bulk tier upgrade requests

---

## 9. Phasing

### Phase 1: Foundation (6 weeks)
- GitHub + email authentication
- Edit existing entities (field-by-field with source citation)
- Edit summary and default source per edit
- Moderation queue (approve / return / request changes)
- Contributor dashboard (submissions + statuses)
- Basic notifications (in-app + email for status changes)
- Entity history page (version timeline, diffs)
- API key self-service registration with scoping
- Rate limiting: anonymous (60/hr) + registered (5,000/hr)
- Developer dashboard: key management + basic usage graph
- API documentation page with interactive "Try it"
- OpenAPI spec at `/api/v1/openapi.json`
- Editing guidelines page
- First-time contributor guided tour

### Phase 2: Depth (4 weeks)
- Trusted contributor system (auto-promotion + auto-approval)
- Add new entities (full-page form with duplicate detection)
- Geometry editing (full-screen split-view for points)
- Entity discussion threads
- Entity following (watchlist) + notifications
- Multi-entity changesets
- Appeal mechanism for returned contributions
- Detailed usage analytics for developers
- Bulk tier auto-approval flow
- Anti-spam: behavioral signals, deviation from authoritative baseline
- Entity locking (semi-locked, fully locked)

### Phase 3: Scale (ongoing)
- Bulk contributions (CSV upload with validation)
- Organization/team accounts for developers
- Webhook subscriptions for entity changes
- Contributor management: batch revert, moderator territories, moderator-to-moderator communication
- Full moderator audit log UI
- Public contributor leaderboard (opt-in)
- SDK/client library scaffolding
- API sandbox/test mode
- Contributor → Moderator nomination path (community governance evolution)

---

## 10. Governance Roadmap (Future)

Phase 1 governance is top-down: Texture appoints moderators. This is appropriate for launch but should evolve as the community grows.

**Future governance milestones:**
1. **Advisory board:** 5-7 community members (mix of contributors, developers, domain experts) providing feedback on editorial policies and roadmap priorities
2. **Moderator nominations:** Active Trusted Contributors can be nominated for moderator roles by existing moderators, with community input
3. **Community guidelines RFC process:** Major editorial policy changes go through a public comment period
4. **Specialized moderator roles:** Regional experts, entity-type experts (someone who deeply understands power plant data vs. EV charging data)
5. **Conflict resolution committee:** For appeals that can't be resolved by a single admin

This is not a commitment to implement all of these — it's an acknowledgment that governance should evolve with community size and complexity.

---

*This document is a living spec refined through expert panel review. It will continue to evolve through design iteration and stakeholder feedback.*
