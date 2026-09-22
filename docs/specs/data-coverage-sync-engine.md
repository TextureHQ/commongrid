# CommonGrid Data Coverage & Sync Engine — Technical Spec

**Author:** Talos
**Status:** Draft for Victor review
**Last updated:** 2026-09-22
**Linear:** CG-285…CG-294 (Coverage epic), CG-289 (EIA-861 adapter, this spec's first shippable)

---

## 1. Problem Statement

CommonGrid launches in days with three named data gaps:

1. **IOU demand-response programs are missing.** Co-op program coverage is excellent (Cyril's hand-cultivated ~600-program dataset). Investor-owned utility (IOU) programs are absent — including flagship programs everyone will look for: National Grid/Eversource **ConnectedSolutions** (MA/CT/RI), Xcel **Renewable Battery Connect** (RBC, *which Texture itself powers*). Missing these makes the launch look unserious.
2. **Municipal utility coverage is thin** — both the muni utility entities and their service-territory GeoJSON boundaries. Zoom into most cities and they're blank.
3. **Co-op ↔ G&T relationships are missing or wrong** — which distribution co-op is served by which Generation & Transmission co-op.

The instinct to fix each in a vacuum is the trap. What we actually need is a **repeatable ingestion engine**: scheduled source adapters that model upstream data into our schema, resolve entities to their parents, upsert as diffs, honor human moderation, and emit changelog — so the *next* gap is a new adapter, not a new project.

**The good news:** that engine already exists in the repo (`lib/sync/apply-sync.ts`). Nothing about the mechanism needs inventing. What's missing is (a) correct *source selection* per gap, and (b) a precedence/provenance layer so multiple overlapping sources compose sanely.

**Anti-goal (explicitly rejected 2026-09-22):** one-shot CSV → DB injection (branch `talos/commongrid-launch-seed-iou-programs`, CG-283). No hand-seeds masquerading as data pipelines. Every record enters through a scheduled, idempotent, changelog-emitting adapter or it doesn't enter.

---

## 2. What We Already Have (and will reuse verbatim)

### 2.1 `applySync` — the single automated write path
`lib/sync/apply-sync.ts`. The automation twin of the community `applyContribution` path. Properties, all already implemented and tested:

- **Bulk diff, one batch.** Compares an upstream dataset against the whole current table, emits many creates/updates, all grouped under one `change_batches` row → changelog reads "EIA-861 sync · 1,204 records", not 1,204 lines.
- **Idempotent.** Re-run with unchanged upstream = empty delta per record = zero version rows = nothing added to changelog. This is the diffing behavior, for free.
- **Conflict policy (B) — human edits are sticky.** Before overwriting a field it checks per-field provenance (`lib/sync/field-provenance.ts`): any field whose *most recent* version was authored by a human (`community`/`admin`/`community_override`) is left untouched and reported as a deferral. A sync is authoritative for machine-owned data, never for a deliberate human correction.
- **Baseline + full version history.** Every write lands an `entity_versions` row in the same transaction, so every change is reconstructable and appears in both the entity changelog and the batch feed.

This directly satisfies Victor's four requirements: (1) runs regularly, (2) models source→our schema, (3) writes as updates/diffs, (4) emits batch + per-entity changelog. **We do not touch this file except possibly to extend the entity-type map.**

### 2.2 Reference adapter + entrypoint to mirror
- `lib/sync/power-plants-860m.ts` — a **pure** (no I/O) upstream→`SyncRecord[]` mapping. Declares exactly which fields the source owns (`EIA_860M_OWNED_FIELDS`) so it never clobbers fields a different source/human owns. This is the template for every new adapter.
- `scripts/sync-power-plants-monthly.ts` — the script entrypoint: fetch upstream → detect change via manifest/checksum → parse (xlsx) → resolve utility via `eiaId` lookup → build records → `applySync(...)` → write JSON/tiles. Idempotent, dry-run-aware, `DATABASE_URL`-gated.
- `app/api/cron/sync-substations/route.ts` + `vercel.json` `crons` — the scheduled trigger pattern (CRON_SECRET-authed, `withCronMonitor`).
- Existing state adapters already in `scripts/`: `sync-arcgis.ts`, `sync-ba.ts`, `sync-cca.ts`, `sync-power-plants(-monthly).ts`, `sync-pricing-nodes.ts`, `sync-transmission-lines.ts`, `sync-ev-charging.ts`. **We are adding to a family, not starting one.**

### 2.3 Entity-resolution primitives that already exist
- `utilities.eiaId` (text) **+ `idx_utilities_eia_id`** — the clean join key from any EIA-keyed source to our utility rows. Also `eiaName`, `shortName`, `baCode`, and a name trigram index for fuzzy fallback.
- `programs.organizations` jsonb — `ProgramOrganization[] = { entityId, role }` where `entityId` is a utility slug and `role` defaults to `ADMINISTRATOR`. This is how a program links to its parent utility (prevents orphans).

---

## 3. The Critical Source-Reality Finding (changes the IOU plan)

Victor's hypothesis: "EIA maintains a database of DR programs; pull it like the other EIA data." I pulled the actual **EIA-861** file specs. Reality:

- **EIA-861 "Demand Response" table** (`core_eia861__yearly_demand_response`, 2013–present) is **aggregate statistics per utility**, not a program catalog. Primary key: `(utility_id_eia, state, customer_class, balancing_authority_code_eia, report_date)`. Columns: enrolled customer counts, potential & actual peak savings (MW), energy savings (MWh), and program costs.
- **It contains no program-level identity:** no program name, website, device types, grid services, participation model, or compensation tiers. It cannot, by itself, create "Renewable Battery Connect" as a named `programs` row.

**Implication:** "pull EIA and we're done" does **not** hold for programs. EIA-861 gives us the *skeleton and the linkage*, not the *flesh*. Charging ahead as if EIA-861 = program catalog would have produced a second wrong build (utility-level aggregate rows with no program identity — arguably worse than the CSV).

### 3.1 What EIA-861 IS authoritative for (so we use it correctly)
1. **Entity-resolution + existence anchor.** `utility_id_eia` → `utilities.eia_id`. Tells us *which* IOUs run material DR and at what enrollment scale — the backbone that guarantees any program we ingest links to the right parent and isn't orphaned.
2. **Coverage/validation signal.** Any IOU with large DR enrollment in EIA-861 but zero named programs in CommonGrid = a known, prioritized gap → drives the coverage badge (CG-285) and a "we know this is missing, contribute it" invitation.
3. **Machine-owned metrics on the utility.** Enrolled counts / peak-savings MW are legitimately sync-owned fields on the utility (or a future program-metrics sub-record).

### 3.2 Where the named IOU programs actually come from
Program-level detail is a **patchwork** (which Victor already accepted as fine). Candidate primary source for named IOU programs:
- **DSIRE** (N.C. Clean Energy Technology Center) — the most comprehensive *structured* catalog of U.S. utility/state incentive & DR programs, with program name, administrator, sector, and description. **Needs a feasibility spike** (below) to confirm license + field fidelity + an entity-resolvable administrator key.
- Fallbacks / supplements: utility program pages (per-utility adapters for the marquee ones — ConnectedSolutions, RBC), state PUC program lists.

**Decision requested:** proceed with DSIRE spike as the primary named-IOU-program feed? (See §7 Open Questions.)

---

## 4. Proposed Architecture — a Layered Ingestion Engine

Three composable layers, all writing through the one `applySync` path, resolved by an explicit precedence matrix.

```
          ┌─────────────────────────────────────────────────────────┐
          │  Layer 3 — HUMAN (moderation queue → applyContribution)  │  highest precedence
          │            community / admin / community_override        │
          ├─────────────────────────────────────────────────────────┤
          │  Layer 2 — STATE / SPECIFIC   (CO / MN / WI ArcGIS,      │
          │            DSIRE, per-utility program pages)             │  beats federal
          ├─────────────────────────────────────────────────────────┤
          │  Layer 1 — FEDERAL BASELINE   (EIA-861, EIA-860M,       │
          │            HIFLD territories, AFDC)                      │  broad, authoritative floor
          └─────────────────────────────────────────────────────────┘
                     ▼  all land through lib/sync/apply-sync.ts  ▼
          bulk diff · idempotent · policy-B human-sticky · batch + per-entity changelog
```

### 4.1 Precedence & provenance (CG-286, CG-287)
`applySync` policy (B) already encodes **human > machine**. We extend it to **machine-vs-machine** precedence with two additions:

- **`data_sources` registry** (CG-286): a table describing each source — key (`eia-861`, `dsire`, `co-arcgis`…), tier (`federal`/`state`/`community`), authority scope (which fields it may own), and cadence. Every `entity_versions` row already carries `source_type` + `initiated_by`; we add `asOf` (upstream observation date) so recency can break ties.
- **Precedence matrix** (CG-287): resolves "state says X, federal says Y" per field: **community > state > federal**, and within a tier, **more recent `asOf` wins**. This directly answers Victor's "moderator edited 3 years ago, federal now disagrees" case: a human edit stays sticky *until* an upstream source with a newer `asOf` crosses a staleness threshold, at which point the field is eligible for machine refresh (configurable per field; default: human edits never auto-expire, surfaced instead as a "possible stale override" review item — safer for launch).

### 4.2 Reusable entity resolver (CG-288)
`lib/sync/resolve-entity.ts`: given an upstream record, resolve its parent utility id via, in order: (1) exact `eia_id`, (2) `ba_code` + state, (3) name trigram + state fuzzy match above threshold, (4) unresolved → quarantine list (never orphan; emit a coverage gap instead). Shared by every adapter so linkage logic lives in one place.

---

## 5. Workstreams (parallelizable — Talos + Meridian)

| ID | Title | Owner | Dep | Ship |
|----|-------|-------|-----|------|
| **CG-289** | EIA-861 program/DR sync adapter + annual cron + de-dup vs co-ops | Talos | — | **First — today** |
| CG-288 | Reusable entity resolver (`resolve-entity.ts`) + eiaId/ba/trgm | Talos | — | With CG-289 |
| CG-286 | Source registry (`data_sources`) + `asOf` on entity versions | either | — | Parallel |
| CG-287 | Precedence matrix + override staleness policy | either | 286 | Parallel |
| CG-285 | Coverage/provenance badges (gaps → contribution invitation) | either | 286 | Parallel |
| CG-290 | Generic ArcGIS/Socrata state boundary adapter (CO/MN/WI munis) | Talos | 288 | After 289 |
| CG-291 | G&T ↔ distribution co-op relationships (edge table + EIA) | — | 288 | After 289 |
| *(spike)* | DSIRE feasibility as named-IOU-program feed | Talos | — | Parallel, this week |

### 5.1 CG-289 concrete build (the shippable-today piece)
Mirrors `power-plants-860m` exactly:
1. `lib/sync/eia-861-dr.ts` — **pure** mapping: EIA-861 DR rows → `SyncRecord[]`, declaring `EIA_861_OWNED_FIELDS` (utility-level DR metrics + existence flag). Utility resolution via `resolve-entity.ts` (eiaId). Unit-tested with fixture rows, no DB/network.
2. `scripts/sync-eia-861.ts` — entrypoint: fetch EIA-861 zip → checksum/manifest change detection → parse (xlsx via `XLSX`, same lib as 860M) → resolve utilities → `applySync({ entityType, initiatedBy: "sync:eia-861", batchTitle: "EIA-861 annual sync" })` → write JSON marker. Dry-run + `DATABASE_URL`-gated, idempotent.
3. `app/api/cron/sync-eia-861/route.ts` + `vercel.json` cron (annual; EIA-861 final release is annual, so `0 0 1 11 *`-ish with monthly re-check for late revisions). CRON_SECRET-authed, `withCronMonitor`.
4. Tests: mapping purity, idempotent re-run (second run = 0 writes), policy-B deferral (human-edited field preserved), utility de-dup (never duplicate a co-op program already present).

**Scope guard:** CG-289 delivers the *federal baseline + linkage anchor + coverage signal*. It does **not** claim to populate named IOU programs — that's the DSIRE spike / per-utility adapters. This boundary is the whole point of the source-reality finding in §3.

---

## 6. Rollout Plan

1. **Backwards-compatible, additive.** New tables (`data_sources`), new nullable column (`asOf`), new adapter files, new cron routes. No change to existing sync behavior or schema of live entities.
2. **Ship CG-289 behind a dry-run first.** Run against prod-shaped data in dry-run, inspect the batch report (created/updated/unchanged/deferrals) before enabling the writing cron.
3. **Migrations forward-only**, applied via the repo's `db:migrate` in the Vercel build step (existing pattern), never hand-run DDL.
4. **Each layer independently revertable** — disabling a cron or a `data_sources` row removes a source without touching others.
5. **Launch posture:** CG-289 + coverage badges gives an honest launch — "here's what we have, here's what we know is missing, contribute it" — even before every named IOU program is in. Marquee programs (RBC, ConnectedSolutions) get per-utility adapters or a moderated seed-*via-the-contribution-path* to close the embarrassment fast, tracked separately.

---

## 7. Open Questions (need Victor)

1. **DSIRE as primary named-IOU-program source** — approve the feasibility spike? (license terms + whether administrator field resolves to `eia_id`/utility). If DSIRE isn't clean, fallback is per-utility adapters for the top ~20 IOU programs.
2. **Human-override staleness:** default to *never auto-expire a human edit* (surface as review item) vs. *auto-refresh after N years when upstream asOf is newer*. I recommend never-auto-expire for launch (safest), revisit post-launch. Agree?
3. **Marquee programs (RBC/ConnectedSolutions) for launch:** acceptable to enter them through the **moderated contribution path** now (fast, correct provenance = human) while the DSIRE/per-utility adapters mature? This closes the visible gap in hours without a hacky seed.
4. **EIA-861 DR metrics home:** attach utility-level DR enrollment/peak-savings to the `utilities` entity, or model a `program_metrics` sub-record? (Leaning utility-level for now; program-level metrics need named programs first.)

---

## 8. Appendix — Source Inventory

| Source | Tier | Grain | Gives us | Adapter |
|--------|------|-------|----------|---------|
| EIA-861 DR | federal | utility × state × sector × BA × year | DR existence, enrollment/peak MW, `eia_id` linkage | CG-289 (new) |
| EIA-860M | federal | generator | power plant status/capacity | exists |
| HIFLD territories | federal | utility polygon | service-territory GeoJSON | exists (`sync-arcgis`) |
| DSIRE | national NGO | **named program** | program name/admin/sector/desc | spike |
| CO / MN / WI ArcGIS | state | utility polygon | muni boundaries (better than federal) | CG-290 (generic) |
| Per-utility pages | utility | named program | marquee IOU program detail | per-utility |
| Community moderation | human | any entity | corrections, new programs | exists (`applyContribution`) |
