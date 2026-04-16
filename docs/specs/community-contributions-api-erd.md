# CommonGrid: Community Contributions & Developer API — ERD & Technical Schema Spec

## Technical Specification — Entity Relationship Design

**Version:** 2.0
**Author:** Meridian
**Date:** April 16, 2026
**Status:** Post Expert Panel Review — Round 2 (Implementation Ready)
**PRD Reference:** `docs/specs/community-contributions-api-prd.md`

---

## Changes from v1.0

| # | Change | Source | Rationale |
|---|--------|--------|-----------|
| 1 | Optimistic concurrency redesigned — `entity_version` is now reference-only; real concurrency uses `FOR UPDATE` row locks at approval time. Added `version_conflict` status. | Backend review | Client-side version checks are broken in distributed web apps. Lock must happen atomically during write. |
| 2 | User FK cascades changed from `ON DELETE CASCADE` to `ON DELETE SET NULL`. User IDs made nullable on contributions, changesets, discussion_posts. | Backend review | Must preserve contribution history for audit when users are deleted/banned. |
| 3 | Added polymorphic reference validation triggers (`validate_entity_reference()`) | Backend review | Application-layer validation insufficient; orphaned records accumulate. |
| 4 | `notification_prefs` JSONB → separate `user_notification_prefs` table | Backend review | Type safety, queryability, migration-friendly defaults. |
| 5 | Added `community_editable_fields` metadata table | Backend review | Validates contribution field names, defines critical fields, enables auto-approval rules. |
| 6 | Added `moderation_response_templates` table | Backend review | PRD requires quick-action templates for moderators. |
| 7 | Added reply cycle prevention trigger on `discussion_posts` | Backend review | Self-referential `reply_to_id` can create infinite loops. |
| 8 | Fixed `idx_contributions_changeset` — removed pointless partial index | Backend review | PostgreSQL B-tree indexes already exclude NULLs. |
| 9 | Added `contribution_stats_by_type` JSONB on `users` | Frontend review | Dashboard entity-type breakdown chart requires per-type counts. |
| 10 | Added composite indexes for moderation queue | Frontend review | Multi-column filtering without composite indexes causes full scans. |
| 11 | Denormalized `entity_slug` and `entity_state` on `contributions` | Frontend review | Enables fast geographic filtering and URL construction without JOINs. |
| 12 | Added `data` JSONB to `notifications` for structured payloads | Frontend/Backend review | Rich notifications need parameterized data for rendering. |
| 13 | Added email delivery tracking fields on `notifications` | Frontend review | Need to know if notification emails were delivered. |
| 14 | Added `geometry_before`/`geometry_after` GEOGRAPHY columns to `contributions` | Geospatial review | Geometry must use native PostGIS types, not JSONB (precision, spatial queries, topology validation). |
| 15 | Created `entity_geometry_versions` table | Geospatial review | Spatial version history needs GEOGRAPHY snapshots, separate from attribute deltas. |
| 16 | Added territory topology validation trigger | Geospatial review | Must validate ST_IsValid, detect overlaps before approval. |
| 17 | Added SRID validation CHECK constraints | Geospatial review | Prevent wrong coordinate systems from being silently accepted. |
| 18 | Added spatial indexes on `contributions.geometry_after` | Geospatial review | Enable spatial moderation queries ("nearby pending changes"). |
| 19 | Added `geometry_validation` JSONB + `geometry_change_type` to `contributions` | Geospatial review | Spatial validation results stored for moderator UI. |
| 20 | Documented contribution rate limiting (Upstash Redis) | Backend review | Prevent moderation queue flooding. |
| 21 | Added architecture notes for real-time updates and tile rebuilds | Frontend/Geospatial reviews | Document infrastructure concerns even though not schema tables. |

---

## 1. Executive Summary

This document defines the database schema additions and modifications needed to implement the Community Contributions and Developer API features described in the PRD.

### Technology Decisions

| Concern | Technology | Rationale |
|---------|-----------|-----------|
| **Authentication** | Clerk | Managed auth with GitHub OAuth + email magic links. We store a lightweight `users` table referencing `clerk_user_id` for application-level data. |
| **Rate Limiting** | Upstash Redis (`@upstash/ratelimit`) | Already in the dependency tree. Sliding-window rate limiting by API key, IP, or user ID. |
| **Usage Analytics** | Neon Postgres | API request logs in `api_usage_events`. At current scale (near-zero), simple `GROUP BY` queries suffice. TimescaleDB extension available on Neon if needed later. |
| **Primary Database** | Neon Postgres (existing) | All new tables alongside existing CommonGrid entities. Drizzle ORM for schema + migrations. |
| **Search** | Existing PostGIS + pg_trgm + tsvector | No changes needed. |

### Design Principles

1. **Additive, not destructive** — New tables added alongside existing ones. Existing entity tables gain only `locked_status`. No breaking changes.
2. **Clerk is the auth boundary** — We never store passwords, sessions, or auth tokens.
3. **Polymorphic entity references** — `(entity_type, entity_id)` pairs with trigger-based validation, matching the existing `entity_versions` pattern.
4. **Geometry is first-class** — Spatial changes use native PostGIS GEOGRAPHY types, never JSONB coordinates. Geometry and attribute changes are stored separately.
5. **Audit everything** — Moderation actions, contribution state transitions, and admin operations are all logged.
6. **Preserve history** — User deletion uses `SET NULL`, not `CASCADE`. Contribution history is never destroyed.

---

## 2. Entity Relationship Diagram (Textual)

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│    users      │──1:N──│  contributions   │──N:1──│   changesets     │
│ (Clerk-linked)│      │ (field edits)    │      │ (grouped edits)  │
└──────┬───────┘      └───────┬──────────┘      └──────────────────┘
       │                      │
       │ 1:N                  │ 1:N
       ▼                      ▼
┌──────────────┐      ┌──────────────────┐
│ api_keys     │      │ source_citations │
│ (enhanced)   │      │ (per-field)      │
└──────┬───────┘      └──────────────────┘
       │ 1:N
       ▼
┌──────────────────┐
│ api_usage_events │
└──────────────────┘

┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│    users      │──1:N──│ discussion_posts │──N:1──│discussion_threads│
└──────┬───────┘      └──────────────────┘      └──────────────────┘
       │ 1:N
       ├──────────────────────┐
       ▼                      ▼
┌──────────────────┐  ┌──────────────────┐
│  entity_follows  │  │  notifications   │
└──────────────────┘  └──────────────────┘

┌──────────────────┐      ┌──────────────────┐
│moderation_actions│      │  entity_locks    │
└──────────────────┘      └──────────────────┘

┌──────────────────────────┐  ┌────────────────────────────┐
│ contribution_appeals     │  │ entity_geometry_versions    │
└──────────────────────────┘  └────────────────────────────┘

┌──────────────────────────┐  ┌────────────────────────────┐
│ community_editable_fields│  │ moderation_response_tmpl   │
└──────────────────────────┘  └────────────────────────────┘

┌──────────────────────────┐
│ user_notification_prefs  │
└──────────────────────────┘
```

---

## 3. New Tables

### 3.1 `users` — Application-Level User Profiles

Maps Clerk-managed auth identities to CommonGrid roles, profiles, and contribution stats.

```sql
CREATE TABLE users (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     TEXT NOT NULL UNIQUE,

  -- Profile (synced from Clerk webhooks)
  display_name      TEXT NOT NULL,
  email             TEXT,
  avatar_url        TEXT,
  affiliation       TEXT,                  -- e.g., 'NREL', 'Pacific Gas & Electric'
  bio               TEXT,

  -- Authorization
  role              TEXT NOT NULL DEFAULT 'contributor',
                    -- 'contributor' | 'trusted_contributor' | 'moderator' | 'admin'

  -- Contribution Stats (denormalized)
  contribution_count     INTEGER NOT NULL DEFAULT 0,
  approved_count         INTEGER NOT NULL DEFAULT 0,
  returned_count         INTEGER NOT NULL DEFAULT 0,
  entity_types_edited    TEXT[] NOT NULL DEFAULT '{}',
  contribution_stats_by_type JSONB NOT NULL DEFAULT '{}',
                    -- { "utility": { "total": 15, "approved": 12 }, ... }

  -- Trusted Contributor tracking
  trusted_promoted_at    TIMESTAMPTZ,
  trusted_promoted_by    TEXT,

  -- Moderation
  banned_at              TIMESTAMPTZ,
  banned_until           TIMESTAMPTZ,       -- NULL = permanent
  ban_reason             TEXT,
  warning_count          INTEGER NOT NULL DEFAULT 0,

  -- Moderator preferences
  mod_preferred_entity_types   TEXT[],
  mod_preferred_regions        TEXT[],
  mod_notes              TEXT,              -- internal, visible only to mods/admins

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_banned ON users(banned_at) WHERE banned_at IS NOT NULL;
CREATE INDEX idx_users_created ON users(created_at);
```

**Clerk sync:** Webhook on `user.created` / `user.updated` / `user.deleted` syncs `display_name`, `email`, `avatar_url`. On `user.deleted`, we set `banned_at = now()`, `ban_reason = 'account_deleted'` — user row and contribution history preserved.

---

### 3.2 `user_notification_prefs` — Notification Preferences

Separate table instead of JSONB for type safety, queryability, and migration-friendly defaults.

```sql
CREATE TABLE user_notification_prefs (
  user_id                       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Per-event-type delivery preferences
  contribution_status_delivery  TEXT NOT NULL DEFAULT 'email_immediate',
                                -- 'email_immediate' | 'email_daily' | 'in_app' | 'off'
  followed_changes_delivery     TEXT NOT NULL DEFAULT 'email_daily',
  discussion_activity_delivery  TEXT NOT NULL DEFAULT 'in_app',
  appeal_resolved_delivery      TEXT NOT NULL DEFAULT 'email_immediate',

  -- Global toggles
  email_paused      BOOLEAN NOT NULL DEFAULT false,
  digest_hour       INTEGER,              -- 0-23 for daily digests (UTC)

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 3.3 `changesets` — Grouped Edits

```sql
CREATE TABLE changesets (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,

  title             TEXT NOT NULL,
  description       TEXT,

  status            TEXT NOT NULL DEFAULT 'open',
                    -- 'open' | 'submitted' | 'partially_approved' | 'approved' | 'returned'

  contribution_count INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at      TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ
);

CREATE INDEX idx_changesets_user ON changesets(user_id);
CREATE INDEX idx_changesets_status ON changesets(status);
```

---

### 3.4 `contributions` — Individual Edit Proposals

The core table. Each row is a proposed edit to a single entity.

```sql
CREATE TABLE contributions (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  changeset_id      TEXT REFERENCES changesets(id) ON DELETE SET NULL,

  -- Target entity (polymorphic — validated by trigger, see §6)
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  entity_version    INTEGER NOT NULL,      -- version at edit time (reference for diffs, NOT concurrency lock)

  -- Denormalized entity metadata (cached at creation for fast filtering)
  entity_slug       TEXT NOT NULL,         -- for URL construction without JOINs
  entity_state      TEXT,                  -- for geographic filtering in mod queue (NULL for non-state entities)

  -- Attribute changes (geometry excluded — see geometry columns below)
  changes           JSONB NOT NULL,        -- { field_name: { old: value, new: value } }

  -- Geometry changes (native PostGIS types — NOT in changes JSONB)
  geometry_change_type  TEXT CHECK (
    geometry_change_type IS NULL OR
    geometry_change_type IN ('point_moved', 'polygon_edited', 'polygon_created', 'geometry_deleted')
  ),                                       -- NULL for non-geometry edits
  geometry_before       GEOGRAPHY,         -- snapshot of current geometry at edit time
  geometry_after        GEOGRAPHY,         -- proposed geometry
  geometry_validation   JSONB,             -- populated by validation trigger (see §7)

  -- Edit summary
  edit_summary      TEXT NOT NULL,         -- min 25 chars

  -- Default source citation
  source_type       TEXT NOT NULL,
                    -- 'eia_filing' | 'utility_website' | 'state_puc' | 'sec_filing'
                    -- | 'ferc_filing' | 'news_article' | 'academic_paper'
                    -- | 'government_db' | 'personal_observation' | 'other'
  source_url        TEXT,
  source_date       DATE,

  -- Moderation status
  status            TEXT NOT NULL DEFAULT 'pending',
                    -- 'pending' | 'approved' | 'returned' | 'changes_requested'
                    -- | 'auto_approved' | 'version_conflict'

  -- Auto-moderation flags
  auto_flagged      BOOLEAN NOT NULL DEFAULT false,
  flag_reasons      TEXT[],

  auto_approved     BOOLEAN NOT NULL DEFAULT false,

  -- Moderator response
  reviewed_by       TEXT REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  moderator_comment TEXT,

  -- If approved, the resulting entity version
  applied_version   INTEGER,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- SRID validation
  CONSTRAINT chk_geometry_before_srid CHECK (
    geometry_before IS NULL OR ST_SRID(geometry_before::geometry) = 4326
  ),
  CONSTRAINT chk_geometry_after_srid CHECK (
    geometry_after IS NULL OR ST_SRID(geometry_after::geometry) = 4326
  )
);

-- Attribute indexes
CREATE INDEX idx_contributions_user ON contributions(user_id);
CREATE INDEX idx_contributions_entity ON contributions(entity_type, entity_id);
CREATE INDEX idx_contributions_status ON contributions(status);
CREATE INDEX idx_contributions_changeset ON contributions(changeset_id);
CREATE INDEX idx_contributions_reviewed_by ON contributions(reviewed_by, reviewed_at DESC)
  WHERE reviewed_by IS NOT NULL;
CREATE INDEX idx_contributions_created ON contributions(created_at);

-- Moderation queue composite indexes
CREATE INDEX idx_contributions_pending ON contributions(status, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_contributions_queue ON contributions(status, entity_type, auto_flagged, created_at DESC)
  WHERE status IN ('pending', 'changes_requested');
CREATE INDEX idx_contributions_flagged ON contributions(auto_flagged, created_at)
  WHERE auto_flagged = true;
CREATE INDEX idx_contributions_by_state ON contributions(status, entity_state, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX idx_contributions_by_user_status ON contributions(user_id, status, created_at DESC);

-- Spatial indexes
CREATE INDEX idx_contributions_geom_after ON contributions
  USING GIST(geometry_after)
  WHERE geometry_after IS NOT NULL;
CREATE INDEX idx_contributions_geom_pending ON contributions
  USING GIST(geometry_after)
  WHERE status = 'pending' AND geometry_after IS NOT NULL;
```

**Optimistic concurrency model:** `entity_version` records the entity's version when the contributor opened the edit panel. This is used for:
- Displaying diffs in the moderation UI (what changed since the contributor last saw it)
- Warning contributors if the entity changed while they were editing

**It is NOT used for write-time concurrency control.** See §5 for the actual concurrency mechanism.

---

### 3.5 `source_citations` — Per-Field Source Overrides

```sql
CREATE TABLE source_citations (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id   TEXT NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,

  field_name        TEXT NOT NULL,
  source_type       TEXT NOT NULL,
  source_url        TEXT,
  source_date       DATE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_source_citations_unique ON source_citations(contribution_id, field_name);
CREATE INDEX idx_source_citations_contribution ON source_citations(contribution_id);
```

---

### 3.6 `contribution_appeals` — Dispute Resolution

```sql
CREATE TABLE contribution_appeals (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id   TEXT NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,

  reason            TEXT NOT NULL,

  status            TEXT NOT NULL DEFAULT 'under_review',
                    -- 'under_review' | 'upheld' | 'overturned'

  assigned_to       TEXT REFERENCES users(id),
  resolved_by       TEXT REFERENCES users(id),
  resolution_note   TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX idx_appeals_contribution ON contribution_appeals(contribution_id);
CREATE INDEX idx_appeals_status ON contribution_appeals(status);
CREATE INDEX idx_appeals_assigned ON contribution_appeals(assigned_to) WHERE assigned_to IS NOT NULL;
```

---

### 3.7 `discussion_threads` — Per-Entity Conversations

```sql
CREATE TABLE discussion_threads (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,

  title             TEXT NOT NULL,

  status            TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'closed'

  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  closed_by         TEXT REFERENCES users(id),

  post_count        INTEGER NOT NULL DEFAULT 0,
  last_post_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ
);

CREATE INDEX idx_threads_entity ON discussion_threads(entity_type, entity_id);
CREATE INDEX idx_threads_status ON discussion_threads(status);
CREATE INDEX idx_threads_last_post ON discussion_threads(last_post_at DESC);
```

---

### 3.8 `discussion_posts` — Thread Comments

```sql
CREATE TABLE discussion_posts (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         TEXT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,

  reply_to_id       TEXT REFERENCES discussion_posts(id) ON DELETE SET NULL,

  body              TEXT NOT NULL,

  is_pinned         BOOLEAN NOT NULL DEFAULT false,
  pinned_by         TEXT REFERENCES users(id),

  deleted_at        TIMESTAMPTZ,
  deleted_by        TEXT REFERENCES users(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_thread ON discussion_posts(thread_id, created_at);
CREATE INDEX idx_posts_user ON discussion_posts(user_id);
CREATE INDEX idx_posts_pinned ON discussion_posts(thread_id, is_pinned) WHERE is_pinned = true;
```

**Reply cycle prevention:** See §6.2 for the `prevent_reply_cycles()` trigger.

---

### 3.9 `entity_follows` — Watchlist

```sql
CREATE TABLE entity_follows (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,

  notify_all_changes    BOOLEAN NOT NULL DEFAULT true,
  notify_discussions    BOOLEAN NOT NULL DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_follows_unique ON entity_follows(user_id, entity_type, entity_id);
CREATE INDEX idx_follows_user ON entity_follows(user_id);
CREATE INDEX idx_follows_entity ON entity_follows(entity_type, entity_id);
```

---

### 3.10 `notifications` — In-App + Email Queue

```sql
CREATE TABLE notifications (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type              TEXT NOT NULL,
                    -- 'contribution_approved' | 'contribution_returned' | 'changes_requested'
                    -- | 'entity_updated' | 'discussion_reply' | 'appeal_resolved'
                    -- | 'trusted_status_earned' | 'entity_followed_update'

  -- Polymorphic reference
  ref_type          TEXT NOT NULL,         -- 'contribution' | 'entity' | 'discussion' | 'appeal'
  ref_id            TEXT NOT NULL,

  -- Pre-rendered display
  title             TEXT NOT NULL,
  body              TEXT,
  url               TEXT,

  -- Structured data for rich rendering (parameterized templates, i18n)
  data              JSONB,
                    -- e.g., {"entity_name": "PG&E", "field": "customer_count", "old": 5400000, "new": 5450000}

  -- Read tracking
  read_at           TIMESTAMPTZ,

  -- Email delivery tracking
  email_type        TEXT,                  -- 'immediate' | 'daily_digest' | 'weekly_digest'
  email_status      TEXT DEFAULT 'pending',-- 'pending' | 'sent' | 'bounced' | 'failed'
  email_sent_at     TIMESTAMPTZ,
  email_service_id  TEXT,                  -- e.g., SendGrid message ID
  delivery_attempts INTEGER NOT NULL DEFAULT 0,  -- increment on each retry, max 3

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_notifications_email_pending ON notifications(email_type, created_at)
  WHERE email_status = 'pending' AND email_type IS NOT NULL;
```

---

### 3.11 `entity_locks` — Protection System

```sql
CREATE TABLE entity_locks (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),

  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,

  lock_level        TEXT NOT NULL,         -- 'semi_locked' | 'fully_locked'
  reason            TEXT,

  locked_by         TEXT NOT NULL REFERENCES users(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,           -- NULL = indefinite

  CONSTRAINT entity_locks_entity_unique UNIQUE (entity_type, entity_id)
);

CREATE INDEX idx_entity_locks_level ON entity_locks(lock_level);
```

---

### 3.12 `moderation_actions` — Full Audit Log

```sql
CREATE TABLE moderation_actions (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id      TEXT NOT NULL REFERENCES users(id),

  action_type       TEXT NOT NULL,
                    -- 'approve' | 'return' | 'request_changes' | 'defer'
                    -- | 'ban_user' | 'unban_user' | 'warn_user'
                    -- | 'promote_trusted' | 'demote_trusted'
                    -- | 'lock_entity' | 'unlock_entity'
                    -- | 'revert_contribution' | 'batch_revert'
                    -- | 'pin_post' | 'delete_post' | 'close_thread'
                    -- | 'resolve_appeal'

  target_type       TEXT NOT NULL,         -- 'contribution' | 'user' | 'entity' | 'discussion_post' | 'appeal'
  target_id         TEXT NOT NULL,

  comment           TEXT,
  internal_note     TEXT,
  metadata          JSONB,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mod_actions_moderator ON moderation_actions(moderator_id, created_at DESC);
CREATE INDEX idx_mod_actions_target ON moderation_actions(target_type, target_id);
CREATE INDEX idx_mod_actions_type ON moderation_actions(action_type);
CREATE INDEX idx_mod_actions_created ON moderation_actions(created_at DESC);
```

---

### 3.13 `entity_geometry_versions` — Spatial Version History

Stores actual PostGIS GEOGRAPHY snapshots for entities with spatial data. Separate from `entity_versions` (attribute deltas) because:
- Only ~20% of entities have geometry — no need to bloat the attribute version table
- PostGIS columns (especially MultiPolygon) are large
- Spatial indexes on historical geometry enable "show me all historical boundaries containing this point"

```sql
CREATE TABLE entity_geometry_versions (
  id                BIGSERIAL PRIMARY KEY,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  version_number    INTEGER NOT NULL,

  -- Actual PostGIS types (not JSONB)
  geography_snapshot GEOGRAPHY,
  geometry_snapshot  GEOMETRY,

  -- Spatial metadata (computed at insert time)
  geometry_type     TEXT,                  -- ST_GeometryType result: 'ST_Point' | 'ST_MultiPolygon' | etc.
  area_sq_km        DOUBLE PRECISION,     -- ST_Area(geography_snapshot) / 1e6 if polygon
  centroid_lat      DOUBLE PRECISION,     -- ST_Y(ST_Centroid(geography_snapshot::geometry))
  centroid_lng      DOUBLE PRECISION,     -- ST_X(ST_Centroid(geography_snapshot::geometry))

  -- Link to main version table
  entity_version_id BIGINT REFERENCES entity_versions(id) ON DELETE CASCADE,

  -- Link to contribution (if community-sourced)
  contribution_id   TEXT REFERENCES contributions(id) ON DELETE SET NULL,

  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (entity_type, entity_id, version_number)
);

CREATE INDEX idx_egv_entity ON entity_geometry_versions(entity_type, entity_id);
CREATE INDEX idx_egv_version ON entity_geometry_versions(entity_version_id);
CREATE INDEX idx_egv_geography ON entity_geometry_versions
  USING GIST(geography_snapshot)
  WHERE geography_snapshot IS NOT NULL;
```

---

### 3.14 `community_editable_fields` — Field Metadata

Defines which fields are community-editable per entity type, whether they're critical (require review even for trusted contributors), and validation rules.

```sql
CREATE TABLE community_editable_fields (
  entity_type       TEXT NOT NULL,
  field_name        TEXT NOT NULL,
  field_type        TEXT NOT NULL,         -- 'text' | 'integer' | 'float' | 'boolean' | 'enum' | 'url'
  is_critical       BOOLEAN NOT NULL DEFAULT false,
  display_name      TEXT,                  -- human-readable label for UI
  validation_rules  JSONB,                 -- e.g., {"min": 0, "max": 1000000}
  PRIMARY KEY (entity_type, field_name)
);

-- Seed examples:
-- INSERT INTO community_editable_fields VALUES
--   ('utility', 'website', 'url', false, 'Website', NULL),
--   ('utility', 'customer_count', 'integer', true, 'Customer Count', '{"min": 0}'),
--   ('utility', 'peak_demand_mw', 'float', true, 'Peak Demand (MW)', '{"min": 0}'),
--   ('power_plant', 'total_capacity_mw', 'float', true, 'Total Capacity (MW)', '{"min": 0}'),
--   ('ev_station', 'ev_pricing', 'text', false, 'EV Pricing', NULL);
```

**Usage:**
- Write-time validation: Zod schema generated from this table validates `contributions.changes` field names
- Auto-approval: Only non-critical fields from trusted contributors can be auto-approved
- Moderation UI: Shows field validation rules and labels to moderators

---

### 3.15 `moderation_response_templates` — Quick Action Templates

```sql
CREATE TABLE moderation_response_templates (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  response_text     TEXT NOT NULL,
  category          TEXT NOT NULL,         -- 'return_reason' | 'changes_requested' | 'welcome'
  created_by        TEXT REFERENCES users(id),
  is_global         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mod_templates_category ON moderation_response_templates(category);
```

---

### 3.16 `api_keys` — Enhanced (Existing Table, Modified)

```sql
ALTER TABLE api_keys ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE api_keys ADD COLUMN tier TEXT NOT NULL DEFAULT 'registered';
  -- 'registered' | 'bulk'
ALTER TABLE api_keys ADD COLUMN app_name TEXT;
ALTER TABLE api_keys ADD COLUMN app_url TEXT;
ALTER TABLE api_keys ADD COLUMN use_case TEXT;
ALTER TABLE api_keys ADD COLUMN description TEXT;
ALTER TABLE api_keys ADD COLUMN last_used_endpoint TEXT;

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_tier ON api_keys(tier);
```

**Key count limit:** Max 10 active keys per user, enforced at application layer.

---

### 3.17 `api_usage_events` — Request Logging

```sql
CREATE TABLE api_usage_events (
  id                BIGSERIAL PRIMARY KEY,
  api_key_id        TEXT REFERENCES api_keys(id) ON DELETE SET NULL,

  endpoint          TEXT NOT NULL,
  method            TEXT NOT NULL,
  status_code       INTEGER NOT NULL,
  response_time_ms  INTEGER NOT NULL,

  is_authenticated  BOOLEAN NOT NULL DEFAULT false,
  tier              TEXT NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_api_key ON api_usage_events(api_key_id, created_at DESC);
CREATE INDEX idx_usage_endpoint ON api_usage_events(endpoint, created_at DESC);
CREATE INDEX idx_usage_created ON api_usage_events(created_at DESC);
CREATE INDEX idx_usage_status ON api_usage_events(status_code, created_at DESC);
CREATE INDEX idx_usage_authed ON api_usage_events(api_key_id, created_at DESC)
  WHERE is_authenticated = true;
```

**Why BIGSERIAL, not UUID?** At zero scale, sequence lock contention is not a concern. BIGSERIAL is simpler, smaller (8 bytes vs 16), and enables efficient cursor-based pagination. If distributed write contention materializes, migrate to UUIDv7 (`pg_uuidv7` extension, available on Neon).

**Retention:** Keep everything initially. When table exceeds 1M rows, implement `api_usage_daily` (§3.18) and drop raw events older than 90 days.

---

### 3.18 `api_usage_daily` — Pre-Aggregated Stats (Phase 2)

```sql
CREATE TABLE api_usage_daily (
  id                BIGSERIAL PRIMARY KEY,
  api_key_id        TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  endpoint          TEXT NOT NULL,

  request_count     INTEGER NOT NULL DEFAULT 0,
  error_count       INTEGER NOT NULL DEFAULT 0,
  avg_response_ms   DOUBLE PRECISION,
  p95_response_ms   DOUBLE PRECISION,

  status_2xx        INTEGER NOT NULL DEFAULT 0,
  status_3xx        INTEGER NOT NULL DEFAULT 0,
  status_4xx        INTEGER NOT NULL DEFAULT 0,
  status_5xx        INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_usage_daily_unique ON api_usage_daily(api_key_id, date, endpoint);
CREATE INDEX idx_usage_daily_key_date ON api_usage_daily(api_key_id, date DESC);
```

---

## 4. Modifications to Existing Tables

### 4.1 Entity Tables — Lock Status

All entity tables gain a `locked_status` column:

```sql
ALTER TABLE utilities ADD COLUMN locked_status TEXT;           -- NULL | 'semi_locked' | 'fully_locked'
ALTER TABLE power_plants ADD COLUMN locked_status TEXT;
ALTER TABLE ev_stations ADD COLUMN locked_status TEXT;
ALTER TABLE pricing_nodes ADD COLUMN locked_status TEXT;
ALTER TABLE balancing_authorities ADD COLUMN locked_status TEXT;
ALTER TABLE isos ADD COLUMN locked_status TEXT;
ALTER TABLE rtos ADD COLUMN locked_status TEXT;
ALTER TABLE programs ADD COLUMN locked_status TEXT;
ALTER TABLE regions ADD COLUMN locked_status TEXT;
ALTER TABLE transmission_lines ADD COLUMN locked_status TEXT;
```

**Sync rule:** `locked_status` MUST be updated in the same database transaction as `entity_locks` INSERT/UPDATE/DELETE. The `entity_locks` table is the source of truth; `locked_status` is a read-performance cache.

### 4.2 `entity_versions` — Enhanced Provenance

```sql
ALTER TABLE entity_versions ADD COLUMN contribution_id TEXT REFERENCES contributions(id) ON DELETE SET NULL;
ALTER TABLE entity_versions ADD COLUMN source_type TEXT;
  -- 'sync' | 'community' | 'admin' | 'merge' | 'community_override'

CREATE INDEX idx_ev_contribution ON entity_versions(contribution_id) WHERE contribution_id IS NOT NULL;
CREATE INDEX idx_ev_source_type ON entity_versions(source_type);
```

When a moderator approves a community value over an official sync value, `source_type = 'community_override'`.

---

## 5. Concurrency Control — Approval Transaction

**Client-side `entity_version` is a reference, not a lock.** The actual concurrency control happens during the moderator's approval action using PostgreSQL row-level locking.

### Approval Flow (Pseudocode)

```sql
BEGIN;

-- 1. Lock the entity row
SELECT * FROM utilities WHERE id = $entity_id FOR UPDATE;

-- 2. Apply changes with version check
UPDATE utilities SET
  customer_count = $new_value,
  version = version + 1,
  updated_at = now()
WHERE id = $entity_id AND version = $expected_version;

-- 3. If 0 rows updated, version changed → conflict
-- Mark contribution as version_conflict and notify moderator
IF ROW_COUNT = 0 THEN
  UPDATE contributions SET status = 'version_conflict' WHERE id = $contribution_id;
  ROLLBACK;
  -- Moderator sees: "This entity was modified since this contribution was submitted"
  RETURN;
END IF;

-- 4. Record the version
INSERT INTO entity_versions (entity_type, entity_id, version_number, delta, ...)
VALUES (...);

-- 5. Update contribution status
UPDATE contributions SET
  status = 'approved',
  applied_version = (SELECT version FROM utilities WHERE id = $entity_id),
  reviewed_by = $moderator_id,
  reviewed_at = now()
WHERE id = $contribution_id;

COMMIT;
```

**Why `FOR UPDATE`?**
- Prevents concurrent approvals on the same entity
- Version check + write happen atomically
- If version changed mid-flight, the transaction detects it and rolls back cleanly

---

## 6. Database Triggers & Validation

### 6.1 Polymorphic Reference Validation

Ensures `(entity_type, entity_id)` references point to existing entities.

```sql
CREATE OR REPLACE FUNCTION validate_entity_reference()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.entity_type
    WHEN 'utility' THEN
      IF NOT EXISTS (SELECT 1 FROM utilities WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type utility: %', NEW.entity_id;
      END IF;
    WHEN 'power_plant' THEN
      IF NOT EXISTS (SELECT 1 FROM power_plants WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type power_plant: %', NEW.entity_id;
      END IF;
    WHEN 'ev_station' THEN
      IF NOT EXISTS (SELECT 1 FROM ev_stations WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type ev_station: %', NEW.entity_id;
      END IF;
    WHEN 'pricing_node' THEN
      IF NOT EXISTS (SELECT 1 FROM pricing_nodes WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type pricing_node: %', NEW.entity_id;
      END IF;
    WHEN 'balancing_authority' THEN
      IF NOT EXISTS (SELECT 1 FROM balancing_authorities WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type balancing_authority: %', NEW.entity_id;
      END IF;
    WHEN 'iso' THEN
      IF NOT EXISTS (SELECT 1 FROM isos WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type iso: %', NEW.entity_id;
      END IF;
    WHEN 'rto' THEN
      IF NOT EXISTS (SELECT 1 FROM rtos WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type rto: %', NEW.entity_id;
      END IF;
    WHEN 'program' THEN
      IF NOT EXISTS (SELECT 1 FROM programs WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type program: %', NEW.entity_id;
      END IF;
    WHEN 'region' THEN
      IF NOT EXISTS (SELECT 1 FROM regions WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type region: %', NEW.entity_id;
      END IF;
    WHEN 'transmission_line' THEN
      IF NOT EXISTS (SELECT 1 FROM transmission_lines WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type transmission_line: %', NEW.entity_id;
      END IF;
    WHEN 'territory' THEN
      IF NOT EXISTS (SELECT 1 FROM territories WHERE id = NEW.entity_id) THEN
        RAISE EXCEPTION 'Invalid entity_id for entity_type territory: %', NEW.entity_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown entity_type: %', NEW.entity_type;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with polymorphic entity references
CREATE TRIGGER trg_contributions_entity_ref
  BEFORE INSERT OR UPDATE ON contributions
  FOR EACH ROW EXECUTE FUNCTION validate_entity_reference();

CREATE TRIGGER trg_threads_entity_ref
  BEFORE INSERT OR UPDATE ON discussion_threads
  FOR EACH ROW EXECUTE FUNCTION validate_entity_reference();

CREATE TRIGGER trg_follows_entity_ref
  BEFORE INSERT OR UPDATE ON entity_follows
  FOR EACH ROW EXECUTE FUNCTION validate_entity_reference();

CREATE TRIGGER trg_locks_entity_ref
  BEFORE INSERT OR UPDATE ON entity_locks
  FOR EACH ROW EXECUTE FUNCTION validate_entity_reference();
```

### 6.2 Reply Cycle Prevention

```sql
CREATE OR REPLACE FUNCTION prevent_reply_cycles()
RETURNS TRIGGER AS $$
DECLARE
  ancestor_id TEXT;
  depth INTEGER := 0;
BEGIN
  IF NEW.reply_to_id IS NULL THEN
    RETURN NEW;
  END IF;

  ancestor_id := NEW.reply_to_id;

  WHILE ancestor_id IS NOT NULL AND depth < 100 LOOP
    IF ancestor_id = NEW.id THEN
      RAISE EXCEPTION 'Reply cycle detected: post % cannot reply to itself', NEW.id;
    END IF;

    SELECT reply_to_id INTO ancestor_id FROM discussion_posts WHERE id = ancestor_id;
    depth := depth + 1;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_discussion_reply_cycle
  BEFORE INSERT OR UPDATE ON discussion_posts
  FOR EACH ROW EXECUTE FUNCTION prevent_reply_cycles();
```

---

## 7. Spatial Validation

### 7.1 Territory Topology Validation Trigger

Runs on contribution insert/update for territory polygon edits. Validates geometry and detects topology conflicts.

```sql
CREATE OR REPLACE FUNCTION validate_territory_topology()
RETURNS TRIGGER AS $$
DECLARE
  adjacent_overlaps INT;
BEGIN
  -- Only run for geometry edits
  IF NEW.geometry_after IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build validation report
  NEW.geometry_validation := jsonb_build_object(
    'is_valid', ST_IsValid(NEW.geometry_after::geometry),
    'validation_reason', ST_IsValidReason(NEW.geometry_after::geometry),
    'is_simple', ST_IsSimple(NEW.geometry_after::geometry),
    'vertex_count', ST_NPoints(NEW.geometry_after::geometry),
    'area_sq_km', ST_Area(NEW.geometry_after) / 1e6
  );

  -- Point entities: compute distance moved
  IF NEW.geometry_before IS NOT NULL AND ST_GeometryType(NEW.geometry_after::geometry) = 'ST_Point' THEN
    NEW.geometry_validation := NEW.geometry_validation || jsonb_build_object(
      'distance_moved_m', ST_Distance(NEW.geometry_before, NEW.geometry_after)
    );
  END IF;

  -- Territory-specific: check for overlaps (not edge adjacency)
  IF NEW.entity_type = 'territory' THEN
    SELECT COUNT(*) INTO adjacent_overlaps
    FROM territories t
    WHERE t.id != NEW.entity_id
      AND ST_Intersects(t.geography::geometry, NEW.geometry_after::geometry)
      AND NOT ST_Touches(t.geography::geometry, NEW.geometry_after::geometry);

    NEW.geometry_validation := NEW.geometry_validation || jsonb_build_object(
      'overlaps_count', adjacent_overlaps
    );
  END IF;

  -- Auto-flag invalid or overlapping geometry
  IF NOT (NEW.geometry_validation->>'is_valid')::boolean
     OR COALESCE((NEW.geometry_validation->>'overlaps_count')::int, 0) > 0
     OR COALESCE((NEW.geometry_validation->>'distance_moved_m')::float, 0) > 100000 THEN
    NEW.auto_flagged := true;
    NEW.flag_reasons := array_append(
      COALESCE(NEW.flag_reasons, ARRAY[]::TEXT[]),
      'geometry_validation_warning'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_geometry
  BEFORE INSERT OR UPDATE ON contributions
  FOR EACH ROW
  WHEN (NEW.geometry_after IS NOT NULL)
  EXECUTE FUNCTION validate_territory_topology();
```

---

## 8. Rate Limiting

### 8.1 API Rate Limiting (Upstash Redis)

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export const rateLimiters = {
  anonymous: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 h"),
    prefix: "ratelimit:anon",
  }),
  registered: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5000, "1 h"),
    prefix: "ratelimit:registered",
  }),
  bulk: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50000, "1 h"),
    prefix: "ratelimit:bulk",
  }),
};
```

### 8.2 Contribution Rate Limiting (Upstash Redis)

Prevents moderation queue flooding. Same Redis instance, different keys.

```typescript
export const contributionLimiters = {
  new_account: new Ratelimit({       // < 7 days old
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 d"),
    prefix: "ratelimit:contrib:new",
  }),
  regular: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 d"),
    prefix: "ratelimit:contrib:reg",
  }),
  trusted: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 d"),
    prefix: "ratelimit:contrib:trusted",
  }),
};
```

---

## 9. Clerk Integration

### Webhook Sync

| Clerk Event | Action |
|------------|--------|
| `user.created` | Create `users` row + `user_notification_prefs` row with defaults |
| `user.updated` | Update `display_name`, `email`, `avatar_url` |
| `user.deleted` | Set `banned_at = now()`, `ban_reason = 'account_deleted'`. Preserve history. |

### Session Validation

```typescript
import { auth } from "@clerk/nextjs/server";

const { userId } = await auth();
if (!userId) return unauthorized();

const user = await db.query.users.findFirst({
  where: eq(users.clerkUserId, userId),
});
```

---

## 10. Foreign Key Summary

```
users.clerk_user_id              → Clerk (external)
changesets.user_id               → users.id (SET NULL)
contributions.user_id            → users.id (SET NULL)
contributions.changeset_id       → changesets.id (SET NULL)
contributions.reviewed_by        → users.id
source_citations.contribution_id → contributions.id (CASCADE)
contribution_appeals.contribution_id → contributions.id (CASCADE)
contribution_appeals.user_id     → users.id (SET NULL)
contribution_appeals.assigned_to → users.id
contribution_appeals.resolved_by → users.id
discussion_threads.created_by    → users.id (SET NULL)
discussion_threads.closed_by     → users.id
discussion_posts.thread_id       → discussion_threads.id (CASCADE)
discussion_posts.user_id         → users.id (SET NULL)
discussion_posts.reply_to_id     → discussion_posts.id (SET NULL, self-ref)
entity_follows.user_id           → users.id (CASCADE)
notifications.user_id            → users.id (CASCADE)
entity_locks.locked_by           → users.id
moderation_actions.moderator_id  → users.id
api_keys.user_id                 → users.id (CASCADE)
api_usage_events.api_key_id      → api_keys.id (SET NULL)
entity_versions.contribution_id  → contributions.id (SET NULL)
entity_geometry_versions.entity_version_id → entity_versions.id (CASCADE)
entity_geometry_versions.contribution_id → contributions.id (SET NULL)
user_notification_prefs.user_id  → users.id (CASCADE)
```

**Polymorphic references** (entity_type + entity_id, validated by trigger):
- `contributions`, `discussion_threads`, `entity_follows`, `entity_locks`, `entity_versions` (existing)

Valid `entity_type` values: `'utility'`, `'power_plant'`, `'ev_station'`, `'pricing_node'`, `'balancing_authority'`, `'iso'`, `'rto'`, `'program'`, `'region'`, `'transmission_line'`, `'territory'`

---

## 11. Migration Plan

### New Tables (in FK dependency order)

1. `users`
2. `user_notification_prefs`
3. `community_editable_fields`
4. `moderation_response_templates`
5. `changesets`
6. `contributions`
7. `source_citations`
8. `contribution_appeals`
9. `discussion_threads`
10. `discussion_posts`
11. `entity_follows`
12. `notifications`
13. `entity_locks`
14. `moderation_actions`
15. `entity_geometry_versions`
16. `api_usage_events`

### Existing Table Modifications

17. `api_keys` — add columns
18. `entity_versions` — add columns
19. All 10 entity tables — add `locked_status`

### Database Functions & Triggers

20. `validate_entity_reference()` + triggers
21. `prevent_reply_cycles()` + trigger
22. `validate_territory_topology()` + trigger

---

## 12. Row Estimates (Phase 1, First 6 Months)

| Table | Expected Rows | Growth |
|-------|--------------|--------|
| users | 50-200 | Slow |
| user_notification_prefs | 50-200 | 1:1 with users |
| contributions | 200-1,000 | ~5-20/day |
| changesets | 50-200 | ~1-5/day |
| source_citations | 100-500 | Low (most use default) |
| contribution_appeals | <10 | Rare |
| discussion_threads | 20-50 | ~1-2/week |
| discussion_posts | 100-300 | ~3-5/week |
| entity_follows | 100-500 | Moderate |
| notifications | 500-5,000 | ~10-50/day |
| entity_locks | <20 | Rare |
| moderation_actions | 200-1,000 | Mirrors contributions |
| entity_geometry_versions | 50-200 | Mirrors spatial contributions |
| community_editable_fields | ~100 | Static (seed data) |
| moderation_response_templates | ~20 | Static |
| api_keys | 20-100 | ~2-5/week |
| api_usage_events | 10K-500K | Depends on adoption |

All tables are small. Neon's free/basic tier handles this comfortably.

---

## 13. Resolved Open Questions

### Q1: BIGSERIAL vs UUID for `api_usage_events.id`?

**Answer: BIGSERIAL.** Smaller (8 bytes vs 16), faster cursor pagination, no sequence lock concern at zero scale. Upgrade path to UUIDv7 documented if distributed write contention materializes.

### Q2: Separate `community_overrides` table?

**Answer: No.** Use `entity_versions.source_type = 'community_override'` to distinguish cases where community data overrides an official sync. No separate table needed — it's just a flag on the version.

### Q3: Is `notifications` flexible enough?

**Answer: Yes, with the addition of `data` JSONB** for structured payloads (entity names, field values, etc.) and email delivery tracking fields (`email_status`, `delivery_attempts`, `email_service_id`).

### Q4: Validate `contributions.changes` field names at write time or approval?

**Answer: Both.** Write-time Zod validation against `community_editable_fields` catches typos immediately. Re-validate at approval time as a safety net for schema drift.

### Q5: Support following all entities of a type?

**Answer: Phase 2.** Phase 1 supports individual entity following only. Phase 2 adds `entity_type_follows` with filter-based subscriptions.

---

## 14. Architecture Notes (Not Schema)

### 14.1 Real-Time Updates

Phase 1 uses polling. The notification bell polls `GET /api/v1/notifications/unread-count` every 30 seconds. The mod queue badge polls similarly.

Phase 2 adds Server-Sent Events (SSE) or WebSockets with Redis PUBSUB for push updates.

The schema supports both patterns — the `notifications` table with `idx_notifications_user_unread` enables efficient polling, and a future Redis PUBSUB layer can push events without schema changes.

### 14.2 Tile Rebuilds

When a contribution with geometry changes is approved, tiles containing that entity become stale.

Phase 1: Full tile rebuild triggered by geometry changes (acceptable at low contribution volume — ~5-10 min rebuild for 160K entities).

Phase 2: Incremental tile rebuilds using bounding box intersection to identify affected tiles.

### 14.3 Active Edit Sessions (Phase 2)

Phase 2 adds an `active_edit_sessions` table to track who has the edit panel open, enabling real-time "someone else is editing this" warnings. Phase 1 relies on the version conflict detection at approval time.

---

## 15. Security Considerations

1. **API keys are hash-stored** — only SHA-256 hash in DB, plaintext shown once.
2. **Clerk handles auth secrets** — no passwords, OAuth tokens, or sessions in our DB.
3. **Rate limiting in Redis** prevents abuse without DB load.
4. **Soft-delete for moderation** — banned users and deleted posts retain data for audit.
5. **Row-level authorization** enforced at application layer.
6. **IP addresses NOT stored** in `api_usage_events` for privacy.
7. **Contribution history preserved** — `ON DELETE SET NULL` keeps audit trail intact.

---

*This document is the authoritative schema specification for the Community Contributions & Developer API features. Implementation should follow this spec. Any deviations should be documented and justified.*
