# CommonGrid Data Coverage Engine — Technical Specification

| Field | Value |
|---|---|
| **Status** | Draft (for review) |
| **Author** | Talos (Principal Architect) |
| **Reviewers** | Victor (CTO), Cyril, Erik |
| **Created** | 2026-09-21 |
| **Last Updated** | 2026-09-21 |
| **Repo** | `TextureHQ/commongrid` |
| **Related** | `docs/specs/persistence-api.md`, `docs/specs/community-contributions-api-*.md` |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [The Reframe: One Engine, Three Gaps](#3-the-reframe-one-engine-three-gaps)
4. [What Already Exists (and Why That Matters)](#4-what-already-exists-and-why-that-matters)
5. [Core Design: Provenance, Precedence, Entity Resolution](#5-core-design-provenance-precedence-entity-resolution)
6. [Gap 1 — IOU / All-Utility Programs (EIA-861)](#6-gap-1--iou--all-utility-programs-eia-861)
7. [Gap 2 — Muni + IOU Territory Boundaries](#7-gap-2--muni--iou-territory-boundaries)
8. [Gap 3 — G&T ↔ Distribution Co-op Relationships](#8-gap-3--gt--distribution-co-op-relationships)
9. [Source Registry & Precedence Matrix](#9-source-registry--precedence-matrix)
10. [Conflict Resolution & Staleness](#10-conflict-resolution--staleness)
11. [Coverage Observability](#11-coverage-observability)
12. [Launch Cut (T-48h) vs. Durable Build](#12-launch-cut-t-48h-vs-durable-build)
13. [Rollout Plan & Phases](#13-rollout-plan--phases)
14. [What We Are NOT Doing (and Why)](#14-what-we-are-not-doing-and-why)
15. [Open Questions](#15-open-questions)
16. [Appendix: Source Reference](#16-appendix-source-reference)

---

## 1. Executive Summary

CommonGrid is 48 hours from launch with three known data-coverage gaps: (1) missing
investor-owned-utility (IOU) demand-response/DER programs, (2) missing municipal-utility
records and territory boundaries, and (3) missing/incorrect generation-&-transmission
(G&T) ↔ distribution co-op relationships.

**These are not three problems. They are one problem — source-of-truth, provenance, and
entity resolution — wearing three costumes.** The strategic move is to build (finish,
really) a single *Data Coverage Engine* rather than three bespoke import scripts. The
engine treats every automated dataset as a well-behaved contributor that writes through
the same versioned, provenance-tracked, human-edit-respecting pipeline the community uses.

**The good news:** the hardest parts already exist in code. `lib/sync/apply-sync.ts`,
`lib/sync/field-provenance.ts`, the `change_batches` table, and the
`community_editable_fields` model already implement idempotent bulk sync, per-field human-edit
protection ("policy B"), and a unified changelog. This spec is ~60% *extension of proven
machinery* and ~40% new work (a source registry, a precedence matrix, a reusable entity
resolver, and three new source adapters).

**Launch is decoupled from the engine.** The T-48h cut is a curated seed of marquee IOU
programs + a one-shot HIFLD muni backfill + coverage/provenance badges that turn gaps into
contribution invitations. The engine ships over the following weeks and back-fills the same
data through the durable path.

---

## 2. Problem Statement

### 2.1 Context

CommonGrid began as Cyril's hand-curated dataset of ~600 **co-op** demand-response programs —
a genuinely unique asset, since no one had aggregated publicly-available co-op program data
before. It grew into a relational open registry: utilities, service territories, power plants,
ISOs/RTOs/BAs, and programs, with a clean REST API (`/api/v1`), a map explorer, and an
OSM/Wikipedia-style moderation + changelog system.

The contribution model *assumes* gaps — that is the whole strategy. The launch risk is not
"some gaps exist"; it is "gaps are so concentrated in obvious places that a first-time visitor
concludes the dataset is garbage." Three areas currently cross that threshold.

### 2.2 The three gaps

1. **IOU / all-utility programs.** Excellent co-op program coverage; near-zero IOU program
   coverage. Conspicuous absences: **Connected Solutions** (New England — MA/CT/RI), **Xcel
   Renewable Battery Connect (RBC)** — which is *powered by Texture* and whose absence is
   actively embarrassing. No federal/authoritative program dataset has been ingested.

2. **Muni + IOU territory reliability.** Good co-op coverage, decent IOU coverage, but many
   **municipal utilities are entirely missing** — both the utility record *and* the GeoJSON
   territory boundary. Zoom into most mid-size cities on the map and there is a hole.

3. **G&T ↔ distribution co-op relationships.** Co-ops split into **G&T co-ops** (generation +
   high-voltage transmission to substation level) and **distribution co-ops** (substation →
   transformer → meter). The parent/child relationship between them is missing or wrong in
   places.

### 2.3 The meta-requirement

Victor's explicit ask: **do not fix these in a vacuum.** Build an *engine* for fixing this
*class* of problem so future gaps (new states, new datasets, new entity types) are a matter of
registering a source, not writing another one-off script. Two hard sub-requirements fall out:

- **Entity resolution:** an upstream record ("program X", "territory Y") must map to the
  correct parent utility. This is the recurring hard problem.
- **Human-edit precedence + staleness:** a moderator-approved manual correction should beat
  an automated sync — *until* the upstream authoritative value is newer than the human edit
  and disagrees, at which point "newest authoritative wins" should probably take over. We need
  a principled, non-destructive answer, not a coin flip.

---

## 3. The Reframe: One Engine, Three Gaps

Every gap reduces to the same three questions:

| Question | Primitive | Status in code |
|---|---|---|
| Where did this fact come from, how fresh is it, how much do we trust it? | **Provenance** | Partial — entity-level (`source`, `reviewedAt`), plus per-field via `entity_versions`. Needs a first-class **source registry** + `as_of`. |
| When two sources disagree, who wins — and when does that flip? | **Precedence** | Partial — "policy B" protects human edits. Needs a **precedence matrix** (source × field-class × region) and staleness handling. |
| What real-world entity does this record attach to? | **Entity resolution** | Partial — `resolve-organizations.ts` (display), `enrich-eia-entities.ts` (EIA IDs). Needs a **reusable resolver** producing scored matches. |

Build these three as first-class, reusable primitives and IOU programs, muni boundaries, and
G&T mapping become *instances* of one engine.

**The load-bearing principle:** *automated syncs are contributors, not overlords.* They write
through the same versioned pipeline as humans (`applySync`, the automation twin of
`applyContribution`), so provenance, conflict-surfacing, staleness handling, and the audit
changelog come **for free** because they are already built. Where a sync is *authoritative*
it writes directly (idempotent, batched); where it is *uncertain* (low-confidence entity
match, or a conflict with a human edit) it **mints a suggestion into the existing moderation
queue** instead of overwriting. Conflict resolution collapses back into machinery we already
shipped and trust.

---

## 4. What Already Exists (and Why That Matters)

Read before building — this spec extends, it does not replace.

- **`lib/sync/apply-sync.ts`** — `applySync(records, opts)` is the single write path for
  scheduled syncs. Bulk, idempotent-by-diff, single-transaction, groups everything under one
  `change_batches` row ("EIA-860M sync · 1,204 records"). Already the automation twin of
  `applyContribution`.
- **`lib/sync/field-provenance.ts`** — `getHumanLockedFields()` walks `entity_versions`
  newest-first and returns the set of fields whose most-recent change was human
  (`community`/`admin`/`community_override`). **This is policy B already implemented.** A sync
  defers (does not overwrite) any human-locked field and records a `FieldDeferral` in the run
  report.
- **`change_batches`** — batches, `initiatedBy` (e.g. `sync:eia-860m`), `versionCount`, changelog integration.
- **`community_editable_fields`** — per-`(entityType, fieldName)` metadata: `fieldType`,
  `isCritical`, validation rules. Already the backbone for auto-approval / critical-field
  routing. We extend the *concept* into the precedence matrix.
- **`entity_versions`** (+ `entity_geometry_versions`) — v1 full snapshot, v2+ deltas with
  `sourceType`. Reconstructable history; geometry is versioned separately.
- **Existing sync adapters** — `sync-power-plants(-monthly)`, `sync-transmission-lines`,
  `sync-ev-charging`, `sync-pricing-nodes`, `sync-substations`, `sync-arcgis` (HIFLD service
  territories!), `sync-ba`, `sync-cca`, `enrich-eia-entities` (EIA-ID matching already exists).
- **CI cadence** — `.github/workflows/sync-monthly.yml`, `sync-annual.yml`,
  `sync-transmission.yml`, `sync-pricing-nodes.yml`, `sync-ev-charging.yml`,
  `weekly-snapshot.yml`, and crucially **`sync-failure-alert.yml`**. The monthly-diff cadence
  Victor described is real and running.
- **`utilities` schema** already carries `eiaId`, `segment`
  (`investor_owned`/`municipal`/`cooperative`/…), `hasGeneration`, `hasTransmission`,
  `hasDistribution`, `baCode`, `serviceTerritoryId`. **The EIA ID join key already exists on
  the canonical table** — the entity-resolution spine is half-laid.
- **`programs` schema** — 607 records; `organizations` JSONB (`{entityId, role}` with
  `ADMINISTRATOR`/`IMPLEMENTER`/`FUNDER`/`REGULATOR`), `assetTypes`, `deviceTypes`, provenance
  columns. Program→utility linkage is via `organizations[].entityId` (utility slug).

> **Note on recent instability:** the last several commits are `commongrid_sync` DB-grant
> fixes (`0026`, `0027`) and pg17 snapshot repairs. Before layering new syncs on top, we
> confirm the `commongrid_sync` role has stable SELECT/USAGE on the tables the new adapters
> touch (programs, utilities, regions, territories) and that `weekly-snapshot.yml` is green.
> New adapters must not reintroduce the grant drift. **Prereq gate, tracked as its own issue.**

---

## 5. Core Design: Provenance, Precedence, Entity Resolution

### 5.1 Provenance — a first-class Source Registry + `as_of`

Today provenance is a free-text `source` column plus the `sourceType` on each version. That is
enough to know *human vs machine* but not enough to answer *"EIA-861 2024 vs CO-PUC 2026-08"*.

Add a **source registry** (seed/config table, mirrors `community_editable_fields` in spirit):

```
data_sources (
  id            text primary key,   -- 'eia-861', 'hifld-rsts', 'co-puc', 'mn-gisdata', 'wi-psc', 'manual', 'community'
  display_name  text not null,      -- 'EIA Form 861 (Annual)'
  authority_tier integer not null,  -- base precedence rank (see 5.2); lower = weaker
  cadence       text,               -- 'annual' | 'monthly' | 'manual' | 'irregular'
  homepage_url  text,
  license       text,
  is_active     boolean not null default true
)
```

And carry, per version (extend `entity_versions` / the `applySync` record), an **`asOf`**
date — the *upstream data vintage*, not the ingest time. `as_of` is the field that makes the
staleness rule in §10 computable. (`observed_at`/ingest time is already `createdAt`.)

We do **not** need per-field source columns on every entity table (that is the `FieldWithSource`
pattern the API layer already exposes to clients). The version history *is* the per-field
provenance store; `getHumanLockedFields()` proves it. We add `asOf` + a `sourceId` FK on the
version so the walk can reason about *which* machine source and *how fresh*.

### 5.2 Precedence — a matrix, not a global list

Precedence is not a single ranking. State PUC boundary data should beat HIFLD *for boundaries
in that state* but must not touch program fields. So precedence is a function:

```
precedence(sourceId, fieldClass, region) -> rank
```

- **`fieldClass`** groups fields by domain: `boundary_geometry`, `program_attributes`,
  `utility_identity`, `utility_metrics` (customer counts, peak MW), `relationships` (G&T links).
- **Base tiers** (default `authority_tier`, highest → lowest):
  1. `manual` / `community_override` (moderator-approved human edit) — *conditional*, see §10
  2. State PUC / state GIS authority (CO, MN, WI, …) — **only for their state, boundary +
     identity classes**
  3. Federal authoritative (EIA-861, HIFLD)
  4. Derived/heuristic (fuzzy entity resolution, computed relationships)
- **Overrides** live in a small `source_precedence_overrides` table keyed by
  `(sourceId, fieldClass, regionScope)` so we tune without code changes — e.g. "for
  `boundary_geometry` in state=CO, `co-puc` outranks `hifld-rsts`."

This is the generalization of `community_editable_fields.isCritical`: instead of a boolean
"needs review," it is a rank that decides *who wins* and *whether a conflict needs review*.

### 5.3 Entity Resolution — one reusable resolver

A single module, `lib/sync/resolve-entity.ts`, reused by every adapter. Deterministic first,
fuzzy fallback, human-in-the-loop for the tail:

1. **Deterministic (golden key):** **EIA Utility ID is the canonical join key.** EIA-861
   assigns it to virtually every utility — IOU, muni, *and* co-op. `utilities.eiaId` already
   exists; `enrich-eia-entities.ts` already back-fills it. Any upstream record carrying (or
   mappable to) an EIA ID resolves deterministically. **Action item:** audit `eiaId` coverage
   on `utilities` and backfill gaps first — every downstream resolution depends on it.
2. **Fuzzy fallback (scored):** normalized name (drop `Electric`/`Cooperative`/`Inc`/`City of`
   noise, casefold, trigram) × state × territory-centroid geo-match (PostGIS — does the
   candidate's territory contain/overlap the upstream feature?). Produce a `matchScore ∈ [0,1]`
   and a `matchMethod`.
3. **Thresholds:**
   - `score ≥ HIGH` → auto-link, write via `applySync`.
   - `LOW ≤ score < HIGH` → **mint a moderation suggestion** (candidate matches attached) —
     the community/moderator confirms. Never auto-link an uncertain match.
   - `score < LOW` → create as **unlinked/orphan** with a `needs_resolution` flag surfaced in
     coverage dashboards and as a contribution prompt.

The resolver returns a structured result (`{ entityId | null, score, method, candidates[] }`),
never a bare id, so callers can branch on confidence uniformly.

---

## 6. Gap 1 — IOU / All-Utility Programs (EIA-861)

### 6.1 Source

**EIA Form 861 / 861S — "Annual Electric Power Industry Report"**, specifically the
**Demand-Side Management / Demand Response** schedules
(`https://www.eia.gov/electricity/data/eia861/`, DSM detail at
`.../eia861/dsm/`). Public domain, annual (~October release), keyed by **EIA Utility ID** —
the same key already on `utilities.eiaId`.

### 6.2 The honest expectation-set (important)

EIA-861 gives **breadth, not depth.** Its DSM/DR schedules report, per utility:
program *existence*, enrolled/potential customers, energy savings (MWh), and **peak demand
reduction (MW)** — broadly by customer class. It does **not** carry the rich
device-level structure Cyril hand-curated (battery vs. thermostat vs. EV, DERMS vendor,
compensation tiers, participation model, program variants).

**Therefore EIA-861 is the spine, not the flesh:**
- It tells us *which utilities run DR/DSM programs* → the definitive "what are we missing" list.
- Marquee programs (Connected Solutions, Xcel RBC) will appear as **utility-level line items**,
  not fully-attributed program records. They still need enrichment (manual, community, or
  program-website scraping) to reach parity with the co-op dataset.
- Do **not** expect EIA to replace hand-work. Expect it to *scope* the hand-work and seed
  stub records with correct `organizations[]` linkage.

### 6.3 Adapter design (`scripts/sync-eia-861-programs.ts`)

1. Download EIA-861 DSM XLSX for the latest year (reuse the download/caching pattern from
   `enrich-eia-entities.ts` / `sync:eia-fields`).
2. For each utility row with DR/DSM activity: build a `SyncRecord` for a **program** entity.
   - `entityId`: stable natural id, e.g. `prog-eia861-<eiaUtilityId>-<year-scoped-slug>`
     (must be re-run-stable — see `applySync` contract).
   - `organizations`: `[{ entityId: <utility-slug-resolved-from-eiaId>, role: ADMINISTRATOR }]`
     via the resolver (§5.3) — deterministic on EIA ID.
   - `assetTypes`/`deviceTypes`: left empty or `unknown` (EIA doesn't provide) → flagged for
     enrichment.
   - `source`: `eia-861`, `asOf`: EIA release year.
   - `capacityTarget` / metrics: mapped from EIA peak-reduction MW where present.
3. Write via `applySync({ entityType: 'program', initiatedBy: 'sync:eia-861',
   batchTitle: 'EIA-861 DSM annual sync' })`. Human-locked fields (Cyril's curation, community
   edits) are automatically deferred by policy B.
4. **De-dup against existing co-op programs:** before creating, check for an existing program
   with the same administrator utility + overlapping name/asset profile. On probable match →
   *update/enrich* the existing record (respecting locks) rather than creating a duplicate.
   Ambiguous → moderation suggestion.

### 6.4 Cadence

Annual (`sync-annual.yml`) — EIA-861 is a yearly release. A monthly poll is wasted work; wire
a yearly cron + a manual `workflow_dispatch` for the launch backfill.

---

## 7. Gap 2 — Muni + IOU Territory Boundaries

### 7.1 Base layer — HIFLD (already wired!)

`sync-arcgis.ts` **already pulls HIFLD "Electric Retail Service Territories"**
(`Electric_Retail_Service_Territories_HIFLD/FeatureServer/0`) and writes territory GeoJSON +
`regions.json`. HIFLD **includes munis** (its `TYPE` field distinguishes MUNICIPAL / COOP /
INVESTOR OWNED / etc.). **The most likely reason munis are missing is a filter/resolution gap
in the existing adapter, not a missing source.**

**First action is diagnostic, not new code:** audit `sync-arcgis.ts` for (a) a `TYPE` filter
that drops munis, (b) resolution failures where a HIFLD muni feature has no matching
`utilities` row (no EIA ID match) and is therefore silently dropped — the same class of bug
called out in `resolve-organizations.ts` ("incomplete is acceptable; invisible is not"). Munis
with no utility record should still render as a territory with a `needs_resolution` utility
stub, not vanish.

### 7.2 Overlay layer — state PUC/GIS (Erik's finds)

Where a state publishes higher-resolution/fresher boundaries, overlay them **above** HIFLD in
the precedence matrix (§5.2) for `boundary_geometry` in that state only:

| State | Source | Endpoint (see appendix) |
|---|---|---|
| Colorado | CO Open Data — Utility Boundaries | `data.colorado.gov/.../nqu9-dz2i` (Socrata) |
| Minnesota | MN GIS — Electric Utility Service Areas (EUSA) | `feat.gisdata.mn.gov/arcgis/.../EUSA_Type/FeatureServer` |
| Wisconsin | WI PSC — Electric Service Territories | `maps.psc.wi.gov/.../PSC_ElectricServiceTerritories/MapServer` |
| (multi) | ArcGIS `COOP_DIST` FeatureServer | `services6.arcgis.com/.../COOP_DIST/FeatureServer` |

These are all **ArcGIS FeatureServer / Socrata** endpoints — the same shapes `sync-arcgis.ts`
already speaks. A **generic ArcGIS FeatureServer adapter** parameterized by
`(url, fieldMapping, sourceId, stateScope)` covers all of them and any future state. This is
the "engine" payoff: adding Washington later = one registry row + one field-mapping, zero new
code.

### 7.3 Geometry conflict handling

Boundaries are versioned in `entity_geometry_versions` (separate from attribute versions). A
state overlay replacing a HIFLD geometry is a normal versioned write; a *human-drawn/corrected*
boundary is geometry-locked by the same policy-B logic (extend `getHumanLockedFields` semantics
to geometry versions). Precedence decides state-vs-federal automatically.

---

## 8. Gap 3 — G&T ↔ Distribution Co-op Relationships

### 8.1 Nature of the problem

This is **relationship resolution**, not attribute sync — the resolver produces *edges*
(distribution-co-op → parent G&T), not field values. Model the edge explicitly rather than
overloading `programs.organizations`:

- Reuse the **`utilities.hasGeneration`/`hasTransmission`/`hasDistribution`** flags to classify
  a utility as G&T-like vs distribution-like (a G&T has generation+transmission, no/low
  distribution meters; a distribution co-op is the inverse).
- Add a **parent relationship**: either a `parentUtilityId` (self-FK on `utilities`, nullable,
  for the wholesale-power-supplier / G&T parent) or a dedicated `utility_relationships` edge
  table (`fromUtilityId`, `toUtilityId`, `relationshipType='wholesale_supplier'|'gt_member'`,
  provenance). **Recommend the edge table** — a distribution co-op can have >1 supplier, and an
  edge table carries its own provenance/versioning cleanly.

### 8.2 Source

- **EIA-861** again — the "Utility Data" / sales-for-resale + the balancing-authority /
  wholesale-power-supplier relationships identify who buys wholesale from whom. This is the
  authoritative federal signal for G&T membership.
- **NRECA / G&T member rosters** (many G&Ts publish their distribution members) — supplemental,
  often scrapeable, good for the tail EIA misses.
- **Derived/heuristic** — geographic containment (a distribution co-op's territory sitting
  inside a G&T's footprint) as a *low-confidence* signal → moderation suggestion, never
  auto-link.

### 8.3 Flow

Same resolver, edge output: high-confidence EIA-derived edges write via `applySync`;
heuristic/ambiguous edges mint moderation suggestions. Every edge carries `sourceId` + `asOf`
so precedence + staleness apply identically.

---

## 9. Source Registry & Precedence Matrix

Concrete seed (illustrative):

| sourceId | display | tier | cadence | field classes it may write |
|---|---|---|---|---|
| `manual` / `community_override` | Moderator-approved edit | (conditional, §10) | manual | all |
| `co-puc` | Colorado Utility Boundaries | state | irregular | boundary_geometry, utility_identity (CO only) |
| `mn-gisdata` | MN EUSA | state | irregular | boundary_geometry, utility_identity (MN only) |
| `wi-psc` | WI PSC Territories | state | irregular | boundary_geometry, utility_identity (WI only) |
| `eia-861` | EIA Form 861 | federal | annual | program_attributes, utility_metrics, relationships |
| `hifld-rsts` | HIFLD Retail Service Territories | federal | irregular | boundary_geometry, utility_identity |
| `eia-860m` | EIA-860M (existing) | federal | monthly | power_plant_* |
| `derived` | Heuristic resolver | derived | n/a | relationships (suggestions only) |

Precedence override example row: `('co-puc','boundary_geometry','state:CO', rank=90)` >
`('hifld-rsts','boundary_geometry','*', rank=50)`.

---

## 10. Conflict Resolution & Staleness

This is the crux of Victor's question and the part that most protects (or destroys) trust.

**Rule (three-way, non-destructive):** when a sync wants to write field `F` on entity `E`:

1. Compute `humanLocked = getHumanLockedFields(E)` (already implemented) and, for locked
   fields, the `verifiedAt` of the human edit (the `entity_versions` row where a human last
   touched `F`).
2. **If `F` is not human-locked** → sync writes directly (policy B unchanged). Idempotent diff;
   no-op if unchanged.
3. **If `F` is human-locked:**
   - **If `source.asOf ≤ humanEdit.verifiedAt`** (upstream is older than or same age as the
     human's knowledge) → **defer** (keep the human value; record a `FieldDeferral`). This is
     today's behavior — correct for the common case.
   - **If `source.asOf > humanEdit.verifiedAt` AND values disagree** (authoritative upstream is
     *newer* than the human edit) → **do NOT silently overwrite, do NOT silently ignore.**
     **Mint a suggestion into the existing moderation queue** ("EIA-861 2027 reports
     `customerCount = 41,200`; community value from 2024-03 is `38,500` — accept upstream?").
     A moderator confirms in seconds.

**Why this is the right answer:**
- Silent overwrite destroys the human-trust contract ("I fixed this and the robot clobbered it").
- Silent ignore is exactly the 3-year-staleness rot Victor is worried about.
- Routing the *conflict* (not every record) through moderation reuses machinery we already
  built and keeps volume tiny — only genuine human-vs-fresh-authoritative disagreements
  surface. Non-conflicting authoritative updates still flow automatically.

**Volume guard:** conflict-suggestions are tagged `origin='sync-conflict'` so they can be
triaged/bulk-actioned separately from organic community suggestions and never bury them.

---

## 11. Coverage Observability

You cannot close gaps you cannot see. Ship a **coverage dashboard** (internal first, public
"data health" page later — it reinforces the correctable-registry brand):

- **Per state × segment coverage:** % of utilities with a territory geometry, with an EIA ID,
  with ≥1 linked program. Muni holes become a ranked worklist instead of a vibe.
- **Resolution health:** count of `needs_resolution` orphans (unlinked programs, unmatched
  territories, dangling G&T edges).
- **Sync health:** last run + `asOf` per source, deferral counts, conflict-suggestion backlog.
  Wire into existing `sync-failure-alert.yml`.
- **Provenance mix:** per entity type, share of fields sourced human vs federal vs state vs
  derived. Feeds the public badges (§12).

---

## 12. Launch Cut (T-48h) vs. Durable Build

**Do not build the engine before launch.** Ship a thin, high-signal cut; back-fill via the
engine after.

### 12.1 Launch cut (make it not look like garbage)

1. **Seed marquee IOU programs manually.** ~10–20 records, hand-curated CSV → one-shot import
   via `applySync` (`initiatedBy: 'manual:launch-seed'`, so they're human-sourced and
   lock-protected). **Connected Solutions** (National Grid/Eversource, MA/CT/RI) and **Xcel
   RBC** are non-negotiable — RBC being Texture-powered and absent is the single most damaging
   gap. Draft list can be produced today.
2. **HIFLD muni backfill (one-shot).** Run/repair `sync-arcgis.ts` for `TYPE = MUNICIPAL`
   features specifically. Biggest visible map improvement, single national layer, low
   effort/high impact. Even if utility-record resolution is imperfect, render the territories
   with stubs rather than leaving holes.
3. **Coverage/provenance badges.** "Community-verified," "Sourced: EIA 2024," "Needs
   verification / help us fill this in." This is the OSM/Wikipedia DNA — a visible gap becomes
   an *invitation to contribute*, the opposite of "garbage." Cheapest, highest-leverage launch
   item; it reframes every remaining gap as intentional.

### 12.2 Durable build (post-launch, in order)

Source registry + `asOf` → precedence matrix → reusable entity resolver (+ `eiaId` backfill
audit) → EIA-861 program adapter → generic ArcGIS/Socrata state adapter (CO/MN/WI) → G&T edge
model + adapter → coverage dashboard. Each lands behind the existing sync-CI + snapshot safety
net and back-fills the launch stubs through the durable path.

---

## 13. Rollout Plan & Phases

| Phase | Scope | Gate |
|---|---|---|
| **P0 — Launch (T-48h)** | Marquee program seed; HIFLD muni one-shot + `sync-arcgis` muni-drop audit; coverage/provenance badges; verify `commongrid_sync` grants + weekly snapshot green | Map has no glaring muni holes in top metros; RBC + Connected Solutions present; badges live |
| **P1 — Engine foundation** | `data_sources` registry + `asOf` on versions; precedence matrix + override table; `resolve-entity.ts` + `eiaId` coverage backfill | Resolver unit-tested; precedence tunable without deploy |
| **P2 — EIA-861 programs** | `sync-eia-861-programs.ts` + annual cron; de-dup vs co-op programs; enrichment-flagging | IOU program breadth ingested; no dupes; deferrals sane |
| **P3 — State boundary overlays** | Generic ArcGIS/Socrata adapter; CO/MN/WI registered; geometry precedence + geometry-lock | State boundaries outrank HIFLD in-state; human geoms protected |
| **P4 — G&T relationships** | `utility_relationships` edge table; EIA-861 wholesale-supplier adapter; heuristic → moderation | Distribution↔G&T edges populated with provenance |
| **P5 — Coverage dashboard** | Internal dashboard → public data-health page | Gaps visible + ranked; sync/deferral/conflict health monitored |

Each phase = its own PR (backend-first per repo norms), its own Linear issue, tests required
(DeepSource coverage), lint/typecheck from project dir before push.

---

## 14. What We Are NOT Doing (and Why)

- **Not routing authoritative federal/state syncs through moderation wholesale.** That buries
  genuine community contributions (the `apply-sync.ts` header already argues this). Only
  *conflicts* and *low-confidence matches* become suggestions.
- **Not per-field `source` columns on every entity table.** `entity_versions` already *is* the
  per-field provenance store; duplicating it invites drift. We add `asOf` + `sourceId` to the
  version, not N columns per table.
- **Not auto-linking uncertain entity matches.** Below the confidence threshold → suggestion or
  orphan, never a silent guess. A wrong parent link is worse than a visible gap.
- **Not blocking launch on the engine.** P0 is decoupled and shippable in 48h.
- **Not hand-running syncs against prod.** Everything is CI-cron + `applySync` in a
  transaction, matching existing `sync-*.yml` workflows and the snapshot safety net.
- **Not inventing a new changelog/versioning path.** Reuse `change_batches` + `entity_versions`.

---

## 15. Open Questions

1. **EIA-861 program granularity:** confirm the DSM schedule's finest grain (per-utility per
   customer-class) and decide the program `entityId` scheme so annual re-runs stay stable and
   don't fork records year-over-year.
2. **Program de-dup policy:** when EIA-861 and Cyril's co-op dataset describe the same program,
   what's the authoritative merge key — administrator utility + normalized name? Needs a
   spot-check pass.
3. **G&T model:** self-FK `parentUtilityId` vs. `utility_relationships` edge table — spec
   recommends the edge table; confirm no downstream API/explorer assumes a single parent.
4. **State source licenses:** CO/MN/WI terms — confirm redistribution under CommonGrid's ODbL.
5. **`asOf` for HIFLD:** HIFLD RSTS vintage is irregular/unclear — what date do we stamp for the
   staleness rule? (Likely the dataset's published `SOURCEDATE`/edit field where present.)
6. **Badge taxonomy:** exact public-facing provenance labels + thresholds (Victor/design call).

---

## 16. Appendix: Source Reference

- **EIA Form 861** — `https://www.eia.gov/electricity/data/eia861/` ·
  DSM/DR detail: `https://www.eia.gov/electricity/data/eia861/dsm/` · annual, public domain,
  keyed by EIA Utility ID. (EIA = U.S. Energy Information Administration.)
- **HIFLD Electric Retail Service Territories** — ArcGIS Hub
  `hifld-geoplatform.hub.arcgis.com` · already consumed by `sync-arcgis.ts` via
  `services3.arcgis.com/.../Electric_Retail_Service_Territories_HIFLD/FeatureServer/0`.
- **Colorado** — `https://data.colorado.gov/dataset/Utilities-Boundaries/nqu9-dz2i` (Socrata).
- **Minnesota** — `https://feat.gisdata.mn.gov/arcgis/rest/services/eusa/EUSA_Type/FeatureServer`.
- **Wisconsin** — `https://maps.psc.wi.gov/server/rest/services/Electric/PSC_ElectricServiceTerritories/MapServer`.
- **Multi-state COOP_DIST** — `https://services6.arcgis.com/N6Lzvtb46cpxThhu/ArcGIS/rest/services/COOP_DIST/FeatureServer`.
- **NRECA / G&T rosters** — supplemental co-op membership (per-G&T published member lists).

> Source URLs verified via Brave Search API on 2026-09-21 (EIA-861 DSM + HIFLD RSTS confirmed
> live). State endpoints are from Erik's #commongrid finds; validate each FeatureServer schema
> before wiring.
