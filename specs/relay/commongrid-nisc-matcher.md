# CommonGrid ↔ NISC Matcher Spec

**Repo:** `TextureHQ/commongrid`
**Version:** v1 — companion to `specs/relay/nisc-to-crm-migration.md` in `TextureHQ/mono`
**Owner:** Meridian
**Reviewers:** Talos (CRM/federation), Lyra (backfill/cron consumer), Atlas (territory map panel)
**Status:** Awaiting review. Ships in parallel with Lyra's migration spec; her Step 6 blocks on A3 (SQL function + scoped role), her CommonGrid snapshot sync blocks on A5 (view), Atlas's org-detail map panel blocks on A6 (territory assets).

---

## Scope

Everything CommonGrid must ship so the NISC → CRM migration can cleanly link forum intelligence to canonical utility records and surface it in Relay. Three deliverables:

1. **A3 — Entity-resolution function**: NISC co-op name → `eia_id`, with confidence + candidates.
2. **A5 — Org enrichment view**: stable, versioned pull target for the CRM nightly snapshot sync.
3. **A6 — Territory assets**: public endpoints + PMTiles layer so the Relay org-detail page can render service territory without embedding GeoJSON in the CRM DB.

Non-goals:
- No CommonGrid schema changes to accommodate CRM/NISC internals. NISC state lives in CRM.
- No federation (subgraph) work yet. That's a future cutover once the Developer API matures.
- No writes from CRM back into CommonGrid. Enforced at the role level (read-only scoped role).

---

## Current State (ground truth)

Verified against the production CommonGrid Neon, 2026-05-08:

- `public.utilities` — 2,980 active rows with `eia_id`. Columns that matter here: `id` (text slug PK), `eia_id` (text, the EIA Utility ID), `name`, `eia_name`, `short_name`, `jurisdiction` (2-letter state code), `website`, `domains` (text[]), `logo`, `customer_count`, `total_meter_count`, `ami_meter_count`, `segment`, `service_territory_id` (FK → `regions`), `deleted_at`.
- Existing indexes we'll lean on:
  - `idx_utilities_name_trgm` — GIN on `name` with `gin_trgm_ops` (trigram ready)
  - `idx_utilities_domains` — GIN on `domains` text[]
  - `idx_utilities_eia_id` — btree
  - `idx_utilities_search` — tsvector search_vector (name + eia_name + short_name + jurisdiction)
- `regions` holds the service-territory geometry (linked via `utilities.service_territory_id`).
- Sanity check: `name ILIKE '%vermont electric%'` returns 3 distinct utilities in VT — Coop, Transmission Co, and Power Co. State filter + ownership/segment filter are necessary to disambiguate.
- ⚠️ Note: in Lyra's spec she references `CommonGridFundamentals.domains`. That's the CRM-side mirror. Source of truth is `utilities.domains` here.
- ⚠️ Note: `eia_id` is `text`, not `int`. The matcher contract originally said `int`; spec below corrects to `text`. CRM must use text to match.

---

## A3 — Entity-resolution function

### Contract

```
input:  { nisc_company_name: text, state?: text, domain?: text }
output: {
  eia_id: text | null,
  confidence: float,                   -- 0.0–1.0
  match_source: enum                   -- exact | fuzzy_name_state | domain | manual_override | none
    ( 'exact', 'fuzzy_name_state', 'domain', 'manual_override', 'none' ),
  candidates: [                        -- top 5 when ambiguous, else top 1
    { eia_id: text, name: text, jurisdiction: text, segment: text, score: float }
  ],
  resolver_version: text               -- semver, e.g. "1.0.0"
}
```

### Algorithm (v1.0.0)

Run in order; stop at first rule that yields a unique match at or above its threshold.

1. **Manual override** (highest priority). A `commongrid.nisc_manual_overrides` table mapping `lower(nisc_company_name) + state` → `eia_id`. Populated by Victor/Meridian when the algorithm gets something wrong. Any hit here returns `match_source='manual_override'`, `confidence=1.0`.

2. **Exact normalized name match** within state (when state is provided):
   - Normalize: lowercase; collapse whitespace; strip common suffixes `(co-op|cooperative|coop|inc|llc|corp|corporation|company|co|electric|electric cooperative|power cooperative|rec|emc|pud)` iteratively; strip punctuation.
   - If `normalized(utilities.name) = normalized(input)` AND (state matches `jurisdiction` OR state null) → `confidence=1.0`, `match_source='exact'`.

3. **Trigram fuzzy name match** within state:
   - `similarity(utilities.name, input) >= 0.65` (index-backed via `idx_utilities_name_trgm`)
   - Also consider `eia_name` and `short_name` (max similarity across the three).
   - Confidence = `max_similarity`.
   - If top score ≥ 0.90 **and** unique (next-best score < top - 0.15) → `match_source='fuzzy_name_state'`.
   - Otherwise return top 5 candidates with scores; caller decides based on threshold.

4. **Domain match** (when `domain` is provided):
   - `input.domain = ANY(utilities.domains)` OR host(utilities.website) matches → `match_source='domain'`, `confidence=0.95`.
   - Domain match is authoritative when present and beats fuzzy, but defers to exact name + manual override.

5. **None**: `eia_id=null`, `confidence=0.0`, `match_source='none'`, candidates top 5 by fuzzy score (so the human reviewer has somewhere to start).

Filters applied in all rules:
- `deleted_at IS NULL`
- `status = 'active'`
- If `state` provided: `jurisdiction = upper(state)` (candidates in other states still appear in ambiguous results but never auto-match).
- Segment/ownership filter deferred to v1.1 (most NISC cos are distribution utilities; not strictly required for v1 since we have state).

### Status mapping for CRM (informative)

This function returns raw confidence. CRM's `NiscCompanyOrgMap.status` assignment:

| Confidence | Candidates | CRM status |
|---|---|---|
| ≥ 0.90 | 1 | `autolinked` |
| ≥ 0.75 | >1 | `ambiguous` |
| < 0.75 | any | `unmatched` |

Status `confirmed` / `rejected` are human-written and opaque to the matcher.

### Delivery

**Two paths. Both ship.**

#### Path 1 — SQL function (backfill loop, preferred for Step 6)

```sql
CREATE OR REPLACE FUNCTION commongrid.fn_resolve_nisc_company(
  p_name  text,
  p_state text DEFAULT NULL,
  p_domain text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER                    -- Talos review: caller already has needed SELECTs via the view + function path; DEFINER widens blast radius for no gain.
SET search_path = commongrid, public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Implementation fills in override lookup → exact → domain → fuzzy cascade,
  -- returns the contract JSON with top-5 candidates when non-unique.
  ...
END;
$$;

REVOKE ALL ON FUNCTION commongrid.fn_resolve_nisc_company(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commongrid.fn_resolve_nisc_company(text, text, text) TO relay_crm_sync;
```

**INVOKER vs DEFINER hardening** (Talos review, adopted):
- `SECURITY INVOKER` — function runs as caller; grants are explicit and auditable.
- `SET search_path` pinned — a compromised caller can't shadow `commongrid.*` or `public.*` objects with same-named objects in their own schema.
- `REVOKE ALL ... FROM PUBLIC` then grant narrowly — default-deny.
- CI test asserts the function body has no `INSERT`/`UPDATE`/`DELETE`/`COPY` statements (regex over `pg_proc.prosrc`). Fails the build if anyone adds a write path.

Companion idempotent-re-run cache:

```sql
CREATE TABLE commongrid.nisc_resolver_cache (
  input_hash       text PRIMARY KEY,            -- sha256(lower(name) || '|' || coalesce(state,'') || '|' || coalesce(domain,''))
  nisc_company_name text NOT NULL,
  input_state      text,
  input_domain     text,
  result           jsonb NOT NULL,              -- full contract output
  resolver_version text NOT NULL,
  resolved_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_nisc_resolver_cache_version ON commongrid.nisc_resolver_cache (resolver_version);
```

Cache writes go through the function; when `resolver_version` bumps, Lyra's cutover job refreshes rows whose `resolver_version` is older than current. The CRM-side `NiscCompanyOrgMap` is the source of truth for sticky `confirmed`/`rejected` states — the cache is just a fast-path lookup.

#### Path 2 — HTTP endpoint (steady-state nightly delta)

```
POST https://commongrid.info/api/internal/resolve-utility
Authorization: Bearer <fleet-service-token>
Content-Type: application/json

{ "name": "Vermont Electric Cooperative", "state": "VT", "domain": "vermontelectric.coop" }

→ 200 {
  "eia_id": "19791",
  "confidence": 1.0,
  "match_source": "exact",
  "candidates": [ { "eia_id": "19791", "name": "Vermont Electric Cooperative", "jurisdiction": "VT", "segment": "distribution", "score": 1.0 } ],
  "resolver_version": "1.0.0"
}
```

- Clerk-authenticated under the fleet-service actor. Rate-limited via Upstash (200 req/s burst, 10k req/day baseline — revisit if Lyra's delta exceeds).
- Responses cacheable with `Cache-Control: public, max-age=3600` on clean hits; bypass cache when `match_source='none'` so improvements propagate.
- Not gated on Developer API launch — ships under `/api/internal/*` with fleet-token auth, distinct from the public Developer API surface.

### Access for Lyra's backfill

Create a scoped read role on CommonGrid's Neon:

```sql
CREATE ROLE relay_crm_sync NOLOGIN;
GRANT USAGE ON SCHEMA commongrid TO relay_crm_sync;
GRANT EXECUTE ON FUNCTION commongrid.fn_resolve_nisc_company(text, text, text) TO relay_crm_sync;
GRANT SELECT ON commongrid.nisc_resolver_cache TO relay_crm_sync;
GRANT SELECT ON commongrid.v_crm_org_enrichment TO relay_crm_sync;
GRANT SELECT ON commongrid.enrichment_schema TO relay_crm_sync;

-- Explicitly NOT granted (Talos review):
--   public.utilities                 — caller only needs the view + function, not the raw table.
--   commongrid.nisc_manual_overrides — admin-only; relay_crm_sync is a consumer, not an editor.

-- Login user for Lyra's job
CREATE USER relay_crm_sync_user WITH PASSWORD '<stored in 1Password: Fleet Secrets/CommonGrid Relay Sync Role>';
GRANT relay_crm_sync TO relay_crm_sync_user;
```

Connection string delivered to Lyra via 1Password. No dblink, no foreign-server shenanigans. If we ever need to revoke, it's one `DROP ROLE`.

### Resolver versioning

- `resolver_version` bumps on any algorithm change.
- Minor (`1.0.x`): fix ranking without changing the contract — no action needed by consumers.
- Minor-feature (`1.x.0`): adds fields to `candidates` or accepts new optional inputs — additive, consumers opt in.
- Major (`x.0.0`): changes the input/output contract. Announced in `#commongrid` with 2-week lead; consumers pin and fail-loud on mismatch.

---

## A5 — `v_crm_org_enrichment` view

Stable, versioned pull target for CRM's nightly CommonGrid snapshot sync (Lyra's sync job).

### Schema

```sql
CREATE OR REPLACE VIEW commongrid.v_crm_org_enrichment AS
SELECT
  u.eia_id                                  AS eia_utility_id,       -- text, CRM maps to CrmOrganization.commonGridId
  u.id                                      AS commongrid_utility_slug, -- stable URL-able slug
  u.name                                    AS name,
  u.eia_name                                AS eia_name,
  u.short_name                              AS dba,
  u.segment                                 AS segment,              -- Talos review: renamed from ownership_type alias — semantic honesty. GraphQL resolver on Lyra's side derives ownershipType from segment for v1.
  NULL::text                                AS naics,                -- reserved; not currently populated
  u.jurisdiction                            AS state,
  u.website                                 AS website,
  u.domains                                 AS domains,              -- text[] for downstream domain matching
  u.customer_count                          AS customer_count_total,
  u.total_meter_count                       AS total_meters,
  u.ami_meter_count                         AS ami_meters,
  u.logo                                    AS logo_url,
  NULL::jsonb                               AS territory_bbox,       -- reserved; populated in v1.1 via regions join
  CASE
    WHEN u.eia_id IS NOT NULL
      THEN 'https://commongrid.info/api/utilities/' || u.eia_id || '/territory.geojson'
    ELSE NULL
  END                                       AS territory_geojson_url,
  u.updated_at                              AS updated_at
FROM public.utilities u
WHERE u.deleted_at IS NULL
  AND u.status = 'active'
  AND u.eia_id IS NOT NULL;                                          -- require EIA ID so CRM always has a stable key (v1 scope only — see below)

GRANT SELECT ON commongrid.v_crm_org_enrichment TO relay_crm_sync;
```

**Versioning sidecar — replaces inline `schema_version`** (Talos review, adopted):

```sql
CREATE TABLE commongrid.enrichment_schema (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  version_major     int NOT NULL,
  version_minor     int NOT NULL,
  column_manifest   jsonb NOT NULL,      -- [{name, type, nullable}, ...] matching the current view
  effective_at      timestamptz NOT NULL DEFAULT now(),
  notes             text
);
INSERT INTO commongrid.enrichment_schema (id, version_major, version_minor, column_manifest, notes)
VALUES (1, 1, 0, '[...]'::jsonb, 'initial v1 — see specs/relay/commongrid-nisc-matcher.md')
ON CONFLICT (id) DO NOTHING;
```

Lyra's sync job reads `SELECT version_major, version_minor, column_manifest FROM commongrid.enrichment_schema;` on startup, compares against its pinned major, and fails loud on mismatch. `column_manifest` lets the sync do a structural dry-check — asserts each pinned column still exists with the expected type before the first row is copied. Catches silent column renames.

**On `eia_id IS NOT NULL` filter** (Talos review): correct for v1 because every `NiscCompanyOrgMap.eiaUtilityId` must resolve to a canonical key. It *won't* generalize — some CommonGrid utilities (new entrants, small municipals below EIA reporting threshold) lack EIA IDs. V2 concern: add a Texture-internal stable ID on `utilities` and expose both in the view.

### Schema-version policy

- Start at `1`.
- Additive changes (new nullable columns): minor bump tracked via `schema_version_minor` meta column (deferred; `1.x` handled via a sidecar table `commongrid.enrichment_schema` with `version_major int, version_minor int`).
- Breaking changes (rename/remove columns, change types): major bump; coordinated migration with 2-week `#commongrid` announcement.
- Lyra's sync job: `SELECT schema_version FROM commongrid.v_crm_org_enrichment LIMIT 1;` on startup. Compare to pinned major. If mismatch, `exit 1` with a loud log line; sync does NOT run against an unknown shape.

### Known gaps for v1.1 (non-blocking)

- `territory_bbox`: deferred until I land the regions-join. Lyra sync just stores `NULL` for now; Atlas uses `territory_geojson_url` which is complete.
- `naics`: EIA-861 exposes this per utility; requires a small backfill against `utilities.naics_override` or similar new column. Not blocking for v1.
- `ownership_type`: today I'm mapping to `segment`. This is imprecise — `segment` is about value-chain position (distribution/transmission/generation) not ownership (co-op/muni/IOU). EIA Form 861 has ownership type and I have it in the raw import; plan to land a `ownership_type` column on `utilities` in a follow-up (tracked separately). For v1 of the sync, CRM gets `segment` under the `ownership_type` alias; CRM can rename when I land the real column.

---

## A6 — Territory assets

Atlas's org-detail page needs to render the service territory map panel. Two delivery options ship; Atlas picks per panel.

### A6.1 — GeoJSON endpoint

```
GET https://commongrid.info/api/utilities/{eia_id}/territory.geojson
GET https://commongrid.info/api/utilities/slug/{slug}/territory.geojson   # alias, same response (Talos review)
```

- Public, no auth, `Cache-Control: public, max-age=86400, stale-while-revalidate=86400`.
- Returns a single `Feature` with `geometry: Polygon|MultiPolygon` and `properties: { eia_id, commongrid_utility_slug, name, jurisdiction, source, updated_at }`.
- **Slug alias** (Talos review): keying Relay bookmarks by Texture slug guards against EIA reassignments. `utilities.id` is an immutable Texture slug and the right durable identifier. M7 ships the `eia_id` path first; slug alias follows as M7.1 (non-blocking).
- 404 if utility has no territory. Atlas should handle gracefully (many small cos don't have boundaries).
- Size: typical single-state co-op ~3–30 KB gzipped; large IOUs (e.g. PG&E) up to ~500 KB. Use PMTiles for the large ones.

Usage in Mapbox:
```js
map.addSource('territory', { type: 'geojson', data: `/api/utilities/${eiaId}/territory.geojson` });
map.addLayer({ id: 'territory-fill', type: 'fill', source: 'territory', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.15 }});
map.addLayer({ id: 'territory-line', type: 'line', source: 'territory', paint: { 'line-color': '#2563eb', 'line-width': 1.5 }});
```

### A6.2 — PMTiles layer

```
pmtiles://commongrid.info/tiles/utility-territories.pmtiles
```

- All utility territories in a single PMTiles file, ~40–80 MB range, rebuilt weekly by existing tile cron.
- Vector tile features carry `eia_id` as a property; Atlas filters with Mapbox's feature-state or a data-expression `['==', ['get', 'eia_id'], selectedEiaId]`.
- Best for: (a) showing selected territory + neighboring territories in the same view, (b) large territories, (c) zoom-in without re-fetching.

### Why both

The GeoJSON endpoint is simpler for a focused detail panel. PMTiles is better if Atlas wants to show adjacent territories for context (which Victor hinted at — "a map of the service territory" suggests more than just an outline). Shipping both doesn't cost much; the GeoJSON endpoint is essentially a view over the same source data.

---

## Atomic fleet tasks (Meridian's side)

All in `TextureHQ/commongrid`. Branch prefix `meridian/`. Each ships green CI, Claude-review clean, merged to main. Ordered by Lyra/Atlas's blocking dependency.

| # | Title | Blocks | Shape |
|---|---|---|---|
| M1 | **Scoped read role `relay_crm_sync`** — create role, password in 1Password, share connection string with Lyra | Lyra Step 6 entry | Migration + ops |
| M2 | **`v_crm_org_enrichment` view v1** — with `schema_version=1` | CRM nightly snapshot sync | Migration (idempotent view DDL) |
| M3 | **`fn_resolve_nisc_company` SQL function v1.0.0** — override lookup + exact + domain + fuzzy cascade | Lyra Step 6 | Migration (SQL function) + tests |
| M4 | **`commongrid.nisc_resolver_cache` + `commongrid.nisc_manual_overrides` tables** — used by M3, grants to `relay_crm_sync` | M3 | Migration |
| M5 | **Resolver sanity fixture + CI test** — fixture with ~30 known NISC co-op names + expected `eia_id`; pytest/vitest asserts ≥ 90% recall at confidence ≥ 0.90 | Trust in M3 | Test script |
| M6 | **HTTP endpoint `POST /api/internal/resolve-utility`** — Clerk fleet-token auth, wraps M3, rate-limited | Lyra steady-state cron | Next.js route handler |
| M7 | **Territory GeoJSON endpoint `/api/utilities/{eia_id}/territory.geojson`** | Atlas org map panel | Next.js route handler + caching |
| M7.1 | **Slug-alias route** `/api/utilities/slug/{slug}/territory.geojson` — Talos review; guards Relay bookmarks against EIA reassignments | Follow-up to M7 | Next.js route handler (non-blocking) |
| M8 | **PMTiles utility-territories tile** — extend existing tile build to include per-territory `eia_id` + `slug`; publish to `commongrid.info/tiles/utility-territories.pmtiles` | Atlas (optional, can ship after GeoJSON) | Tippecanoe build + CDN upload |
| M9 | **Public docs** — `DB-SCHEMA.md` section + `docs/relay-integration.md` covering A3/A5/A6 contract, schema-version policy, how CRM should pin | Onboarding / future consumers | Docs |
| M10 | **`v_deprecated_eia_ids` view** — lists eia_ids that left `v_crm_org_enrichment` with reason (`soft_deleted` \| `merged_into:<new_eia_id>` \| `data_quality_reject`). Lyra joins against this instead of set-diffing. | Lyra's orphaned-mapping nightly signal | Migration (view) + backing table for merge tracking |

Ordering for Lyra:
- M1+M2+M3+M4 unblock her Step 6 (company→org mapping).
- M6 unblocks her steady-state cron delta.
- M7/M8 unblock Atlas's map panel in parallel.
- M5 and M9 are in-parallel quality-of-life.

Target cadence: M1–M5 shipped within 48h of Victor approving the spec; M6–M9 the following week.

---

## Expert review — invited panel

This spec is drafted against the review panel Victor assigned to Lyra (staff CRM eng / ex-Apollo / distsys). For the CommonGrid-specific pieces, adding a fourth reviewer perspective that matters more here than federation:

- **Persona CG — Staff geospatial-data engineer, 10+ yrs at Mapbox / Foursquare** — reviews A6 (territory assets), caching strategy, and the GeoJSON vs PMTiles trade-off.

### Predicted notes (to fold into v2 after Talos's real review)

**Persona A (HubSpot CRM):** Override table + snapshot-column discipline is correct. Will likely flag: "what happens to `NiscCompanyOrgMap` rows when a utility is soft-deleted in CommonGrid?" → Answer: matcher excludes `deleted_at IS NOT NULL`. Existing `autolinked|confirmed` rows become stale but are not auto-rejected — Lyra's nightly sync should emit a `OrphanedMapping` signal when a mapped `eia_id` no longer appears in `v_crm_org_enrichment`. Worth adding an atomic task on Lyra's side.

**Persona B (ex-Apollo federation):** No federation in v1 — that's fine, they'll ask "what's the migration path." Answer: when CommonGrid gains a Federation v2 subgraph, `CrmOrganization` switches from snapshot columns to `@external commonGridId: ID!` + `commongrid: CommonGridUtility @provides(fields: "name customerCount ...")`. No Atlas surface change because the resolver layer hides it. Worth writing this as an explicit ADR later.

**Persona C (distsys):** Will catch two things:
1. `fn_resolve_nisc_company` is `SECURITY DEFINER` — fine since it only does `SELECT`, but add a comment explaining why and a unit test that the function cannot mutate state.
2. Rate limiting on `POST /api/internal/resolve-utility` — if Lyra's cron fan-out is bursty, 200 req/s may not be enough. Recommend: async batch endpoint `POST /api/internal/resolve-utility/batch` accepting `{ queries: [{ name, state, domain }, ...] }` up to 500 per call. Fold into M6 if Lyra wants.

**Persona CG (geospatial):** Will push back on "ship both GeoJSON and PMTiles." Specifically:
1. For a single-utility detail panel, PMTiles overhead (loading an 80MB file to render one territory) is wasteful. GeoJSON wins.
2. But for any future "see neighboring territories" or "map of all co-ops in a state" view, GeoJSON breaks. PMTiles wins.
3. Recommendation confirmed: ship both, but document the usage guidance so Atlas doesn't reach for the wrong one. Added to M9 docs.

---

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Trigram threshold (0.65) yields too many false positives on short names ("ACE" matches "PACE", "GRACE", etc.) | Med | Med | M5 fixture covers short-name edge cases; threshold tunable without breaking contract; add a minimum-name-length pre-filter (≥5 chars) before fuzzy. |
| `eia_id` for a utility changes (EIA occasionally reassigns IDs on merger) | Low | High | CRM's `NiscCompanyOrgMap` stores both `eia_id` and `commongrid_utility_slug`; sync job can detect drift by slug. Rare event, handle as a follow-up alerting task. |
| Public territory GeoJSON endpoint gets scraped heavily | Med | Low | It's already public data — that's the point. CDN caches for 24h. If abuse, move to signed URLs for large territories. |
| Resolver cache grows unbounded | Low | Low | `nisc_resolver_cache` is bounded by distinct NISC company names (~a few thousand). Non-issue. |
| CRM pins `schema_version=1` then I break it without warning | Med | High | Major bumps require 2-week notice in `#commongrid`. Failing loud on mismatch is part of Lyra's sync job (spec item A5). |
| Lyra's backfill hits Neon connection limits via fan-out | Med | Med | Backfill is single-connection sequential batches of 500; no fan-out. Steady-state HTTP endpoint has rate limits. |

---

## Open questions for review

1. **Ownership type** — is `segment` (distribution/transmission/generation) acceptable as v1 proxy for what CRM calls `ownership_type`, or should I block M2 on landing a real ownership-type column? My call: ship v1 with `segment`, land real column in a follow-up, CRM renames its view consumer when it lands.
2. **Fuzzy threshold confidence ≥ 0.90** for autolink — I picked 0.90. Lyra's spec had 0.85. I want to run M5's fixture against real NISC names first and publish the precision/recall numbers; if 0.85 gives materially better recall without false positives, I'll adopt it. Ask to hold final threshold decision until M5 data lands.
3. **Manual override ergonomics** — today `nisc_manual_overrides` is a SQL table Victor/I edit directly. Should I build a simple admin UI in CommonGrid site for this, or keep it SQL-only? Leaning SQL-only for v1; total table size will be <200 rows.
4. **Batch HTTP endpoint** — ship `/api/internal/resolve-utility/batch` in M6 or wait for Lyra to tell me she needs it? Default: wait. Cheap to add later.

---

## Revision log

- **v1 (2026-05-08)** — Initial draft, companion to Lyra's `nisc-to-crm-migration.md` v1. Open for review.
- **v1.1 (2026-05-08)** — Talos review addressed:
  - `fn_resolve_nisc_company`: `SECURITY DEFINER` → `SECURITY INVOKER` with pinned `search_path`, `REVOKE ALL FROM PUBLIC`, and a CI test asserting no write statements.
  - `relay_crm_sync`: removed `GRANT SELECT ON public.utilities`. Role only has view + function + cache + schema-table access.
  - `v_crm_org_enrichment`: renamed `ownership_type` alias → `segment` for semantic honesty; Lyra derives `ownershipType` in her GraphQL resolver.
  - Added `commongrid.enrichment_schema` sidecar table replacing the inline `schema_version` column; includes `column_manifest` JSONB for structural dry-check.
  - Territory endpoint: added slug-alias route `/api/utilities/slug/{slug}/territory.geojson` (M7.1) so Relay bookmarks survive EIA ID reassignments.
  - Added M10 — `v_deprecated_eia_ids` view with structured departure reason, replacing set-diff on Lyra's side.
  - Confirmed: batch HTTP endpoint deferred (Lyra's delta is <100 rows/day, well under ceiling).
