# CommonGrid Database Schema

_The open registry of US energy infrastructure._

This document describes the public Postgres schema that powers [commongrid.info](https://commongrid.info)
and the REST API at `https://commongrid.info/api/v1`. It is intended for:

- Researchers, journalists, and policy analysts writing ad-hoc SQL against the data.
- Developers integrating via the public REST API (see [`docs/api-integration.md`](./docs/api-integration.md)
  for the HTTP contract and [`public/openapi.json`](./public/openapi.json) for the machine-readable spec).
- Contributors adding new datasets or columns via pull request.

> **Source of truth:** Drizzle ORM definitions in [`lib/db/schema/`](./lib/db/schema/). This doc is
> hand-maintained; when the schema changes, update both the migrations _and_ this file in the same PR.

---

## Contents

- [Conventions](#conventions)
- [Entity overview](#entity-overview)
- [Geographic / market backbone](#geographic--market-backbone)
  - [`regions`](#regions)
  - [`territories`](#territories) — PostGIS geography
  - [`isos`](#isos) · [`rtos`](#rtos) · [`balancing_authorities`](#balancing_authorities)
- [Core entities](#core-entities)
  - [`utilities`](#utilities)
  - [`power_plants`](#power_plants)
  - [`transmission_lines`](#transmission_lines)
  - [`substations`](#substations)
  - [`transmission_line_endpoints`](#transmission_line_endpoints)
  - [`ev_stations`](#ev_stations)
  - [`pricing_nodes`](#pricing_nodes)
  - [`programs`](#programs)
- [Support tables](#support-tables)
- [Example queries](#example-queries)
- [Data sources](#data-sources)

---

## Conventions

| Convention | Details |
|---|---|
| **Soft deletes** | Every entity table carries `deleted_at TIMESTAMPTZ`. Active rows have `deleted_at IS NULL`. **Always filter on this in your queries** — the app layer does it for you. |
| **Slugs** | `text NOT NULL UNIQUE`, URL-safe. Use slugs for user-facing URLs and API paths. |
| **IDs** | Opaque `text` primary keys (namespaced, e.g. `util-eia-15258`, `pp-2403`, `region-st-1000`). Stable across revisions. |
| **Versioning** | Each row has `version INTEGER NOT NULL DEFAULT 1`; entity-level deltas live in the `entity_versions` support table. |
| **Provenance** | `source`, `source_url`, `submitted_by`, `reviewed_at`, `reviewed_by` on every entity row. |
| **Timestamps** | All `timestamp with time zone`. `created_at` / `updated_at` are `NOT NULL`; mutation triggers or app logic keep `updated_at` fresh. |
| **Geography** | PostGIS is the source of truth for spatial. Where present, `geography(..., 4326)` is authoritative and `geometry(..., 4326)` is a `GENERATED ALWAYS AS (... ::geometry) STORED` mirror for tile export and planar bbox queries. |
| **Full-text search** | Search-capable tables have a `tsvector search_vector` column that is `GENERATED ALWAYS AS (...) STORED` at migration level, plus a GIN index. Query with `plainto_tsquery('english', $1)`. |
| **Locks** | `locked_status` (`NULL`, `'semi_locked'`, `'fully_locked'`) is a denormalized cache of the `entity_locks` table used by community-contribution review. |

### Soft-delete quick reference

```sql
-- RIGHT
SELECT * FROM utilities WHERE deleted_at IS NULL;

-- WRONG (will return deleted rows)
SELECT * FROM utilities;
```

### Enum columns

Several columns store enum-like `text` values (validated at the app layer, not via Postgres enums — this
keeps migrations cheap). Values used in production:

| Column | Values |
|---|---|
| `utilities.segment` | `investor_owned`, `municipal`, `cooperative`, `federal`, `state`, `political_subdivision`, `cca`, `retail`, `wholesale`, `other` |
| `utilities.status` | `active`, `inactive`, `merged`, `retired` |
| `power_plants.status` | `operable`, `proposed` |
| `power_plants.fuel_category` | `solar`, `wind`, `natural_gas`, `coal`, `nuclear`, `hydro`, `battery`, `biomass`, `oil`, `geothermal`, `other` |
| `pricing_nodes.iso` | `CAISO`, `PJM`, `ERCOT`, `MISO`, `NYISO`, `ISO-NE`, `SPP` |
| `pricing_nodes.node_type` | `hub`, `zone`, `generator`, `load`, `interface`, `aggregate` |
| `substations.substation_type` | `transmission`, `distribution`, `hybrid`, `unknown` |
| `substations.status` | `in_service`, `out_of_service`, `planned`, `retired`, `unknown` |
| `substations.source` | `eia`, `osm`, `manual`, `hybrid` |
| `ev_stations.access_code` | `public`, `private`, `restricted` |
| `ev_stations.status_code` | `E` (available), `P` (planned), `T` (temporarily unavailable) |
| `regions.type` | `state`, `county`, `service_territory`, `iso`, `rto`, `ba`, `cca`, `zip`, `tract`, `nerc` |

---

## Entity overview

Live row counts (as of the most recent sync; `deleted_at IS NULL`):

| Table | Rows | Primary source |
|---|---:|---|
| `regions` | 3,000 | Census TIGER + EIA-861 + ISO/RTO footprints |
| `territories` | 2,920 | EIA-861 + HIFLD + state PUC filings (PostGIS MultiPolygon) |
| `isos` | 7 | NERC / ISO websites |
| `rtos` | 7 | NERC / ISO websites |
| `balancing_authorities` | 45 | EIA-861 / NERC BA registry |
| `utilities` | 3,133 | EIA-861 + EIA-860 + NRECA + website-derived |
| `power_plants` | 15,082 | EIA Form 860 (annual) + Form 860M (monthly) |
| `transmission_lines` | 52,244 | HIFLD Electric Power Transmission Lines |
| `substations` | 60,112 | EIA substations FeatureService + OpenStreetMap (ODbL) |
| `transmission_line_endpoints` | ~104,000 | Derived: fuzzy-matched `sub1`/`sub2` → substation FKs |
| `ev_stations` | 85,425 | DOE AFDC (weekly) |
| `pricing_nodes` | 4,065 | CAISO OASIS, PJM, ERCOT, MISO, NYISO, ISO-NE, SPP |
| `programs` | 607 | Utility program websites + rate/tariff filings |

---

## Geographic / market backbone

### `regions`

Generic container for any named geography: states, counties, service territories, ISO/RTO footprints,
CCA areas, ZIPs, census tracts, NERC regions. Other tables hang spatial geometry (in `territories`) or
metadata off a region by FK.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `text` | PK | Namespaced, e.g. `region-st-1000`, `region-ca-county-037` |
| `slug` | `text` | NOT NULL, UNIQUE | |
| `name` | `text` | NOT NULL | |
| `type` | `text` | NOT NULL | See enum table above |
| `eia_id` | `text` | | EIA region/utility identifier where applicable |
| `state` | `text` | | Two-letter USPS code |
| `customers` | `integer` | | Denormalized customer-count summary (when available) |
| `locked_status` | `text` | | `NULL` / `semi_locked` / `fully_locked` |
| `source`, `source_url`, `source_date` | `text` | | Provenance |
| `submitted_by`, `reviewed_at`, `reviewed_by` | | | Audit trail |
| `created_at`, `updated_at` | `timestamptz` | NOT NULL | |
| `deleted_at` | `timestamptz` | | Soft-delete marker |
| `version` | `integer` | NOT NULL DEFAULT 1 | |

**Indexes:** `idx_regions_slug`, `idx_regions_eia_id`, `idx_regions_type`, `idx_regions_state`.

---

### `territories`

PostGIS-backed geometries for regions. One row per region that has spatial extent.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | Matches a `regions.id` |
| `region_id` | `text` NOT NULL | FK → `regions.id` ON DELETE CASCADE |
| `geography` | `geography(MultiPolygon, 4326)` NOT NULL | **Source of truth** — spherical math |
| `geometry` | `geometry(MultiPolygon, 4326)` | `GENERATED ALWAYS AS (geography::geometry) STORED` |
| `simplified_1km` | `geometry(MultiPolygon, 4326)` | `ST_SimplifyPreserveTopology(geography::geometry, 0.01)` — fast pan/zoom |
| `centroid` | `geometry(Point, 4326)` | `ST_Centroid(geography::geometry)` — labels & lookups |
| `bbox` | `box2d` | `Box2D(geography::geometry)` — pre-filter for spatial joins |
| `area_sq_km` | `double precision` | `ST_Area(geography) / 1e6` |
| `vertex_count` | `integer` | `ST_NPoints(geography::geometry)` — performance audits |
| `source`, `source_url` | `text` | Provenance |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz` | |

**Indexes:** `idx_territories_region_id`, `idx_territories_area`, plus (migration DDL):
- `idx_territories_geography` GIST(`geography`)
- `idx_territories_geography_nd` SPGIST(`geography`)
- `idx_territories_geometry` GIST(`geometry`)
- `idx_territories_simplified_1km` GIST(`simplified_1km`)

**Polygon normalization:** all imports are normalized to `MultiPolygon` at ingest.

---

### `isos`

Independent System Operators. 7 rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug`, `name`, `short_name` | `text` NOT NULL | |
| `logo`, `website` | `text` | |
| `states` | `text[]` NOT NULL DEFAULT `'{}'` | USPS codes |
| `region_id` | `text` | FK → `regions.id` ON DELETE SET NULL |
| `locked_status` | `text` | |
| _provenance + audit_ | | Same as above |

### `rtos`

Regional Transmission Organizations. 7 rows. Identical column set to `isos`.

### `balancing_authorities`

NERC Balancing Authorities. 45 rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug`, `name`, `short_name` | `text` NOT NULL | |
| `eia_code`, `eia_id` | `text` | EIA BA identifiers |
| `logo`, `website` | `text` | |
| `states` | `text[]` NOT NULL | |
| `iso_id` | `text` | FK → `isos.id` ON DELETE SET NULL |
| `region_id` | `text` | FK → `regions.id` ON DELETE SET NULL |
| _locks, provenance, audit_ | | |

**Indexes:** `idx_bas_slug`, `idx_bas_eia_code`, `idx_bas_eia_id`, `idx_bas_iso_id`.

---

## Core entities

### `utilities`

The backbone of the grid — IOUs, munis, co-ops, CCAs, wholesale generators. **3,133 rows.**

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug` | `text` NOT NULL UNIQUE | |
| `name` | `text` NOT NULL | Canonical CommonGrid name |
| `eia_name` | `text` | Name as filed on EIA-861 / EIA-860 |
| `short_name`, `logo`, `website` | `text` | |
| `eia_id` | `text` | EIA Utility ID (NOT unique — transfers, retirements, mergers) |
| `segment` | `text` NOT NULL | See enum table |
| `status` | `text` NOT NULL | `active` / `inactive` / `merged` / `retired` |
| `customer_count` | `integer` | Total retail customers |
| `peak_demand_mw`, `winter_peak_demand_mw` | `double precision` | EIA-861 |
| `total_revenue_dollars`, `total_sales_mwh` | `double precision` | EIA-861 |
| `ba_code`, `nerc_region` | `text` | |
| `has_generation`, `has_transmission`, `has_distribution` | `boolean` | Capability flags (EIA-861) |
| `ami_meter_count`, `total_meter_count` | `integer` | EIA-861 AMI deployment |
| `jurisdiction` | `text` | States served (e.g. `"CA, NV, AZ"`) |
| `iso_id` | `text` | FK → `isos.id` ON DELETE RESTRICT |
| `rto_id` | `text` | FK → `rtos.id` ON DELETE RESTRICT |
| `balancing_authority_id` | `text` | FK → `balancing_authorities.id` ON DELETE SET NULL |
| `generation_provider_id`, `transmission_provider_id` | `text` | Self-FK for upstream suppliers |
| `parent_id`, `successor_id` | `text` | Self-FK for ownership / merger chains |
| `service_territory_id` | `text` | FK → `regions.id` ON DELETE SET NULL (joins to `territories` for geometry) |
| `domains` | `text[]` | Utility web/email domains — powers the resolver's domain-match path |
| `deprecation_reason` | `text` | Free-form note on why a non-ACTIVE utility was deprecated (retirement, merger, acquisition). Surfaced by `v_deprecated_utilities`. |
| `search_vector` | `tsvector` | Weighted GIN index (name A, eia_name B, short_name B, jurisdiction C) |
| `locked_status` | `text` | |
| _provenance + audit + version_ | | |

**Indexes:** `idx_utilities_slug`, `idx_utilities_eia_id`, `idx_utilities_segment`, `idx_utilities_status`,
`idx_utilities_iso_id`, `idx_utilities_rto_id`, `idx_utilities_ba_id`, `idx_utilities_jurisdiction`,
`idx_utilities_parent_id`, `idx_utilities_service_territory`. Plus (migration DDL):
`idx_utilities_search` GIN(`search_vector`), `idx_utilities_name_trgm` GIN(`name gin_trgm_ops`).

**Relationships:**
```
utilities ──┬── iso_id               → isos
            ├── rto_id               → rtos
            ├── balancing_authority_id → balancing_authorities
            ├── service_territory_id → regions ─── (1:1) territories
            ├── parent_id            → utilities (self)
            └── successor_id         → utilities (self)
```

**Lifecycle view:** `v_deprecated_utilities` (below) exposes a normalized
lifecycle shape (status ∈ `active`/`retired`/`merged`/`renamed`, plus
`successor_eia_id`/`successor_slug`) for consumers reconciling historical
names back to canonical IDs. Backs `GET /api/v1/utilities/deprecated`.

---

### `power_plants`

Every utility-scale power-generation facility in the US, sourced from **EIA Form 860**. **15,082 rows.**

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug` | `text` NOT NULL UNIQUE | |
| `name` | `text` NOT NULL | |
| `plant_code` | `text` NOT NULL | EIA plant code |
| `utility_id` | `text` | FK → `utilities.id` ON DELETE SET NULL |
| `utility_name` | `text` NOT NULL | Denormalized snapshot for stale-FK resilience |
| `balancing_authority_id` | `text` | FK → `balancing_authorities.id` ON DELETE SET NULL |
| `ba_code` | `text` | |
| `state` | `text` NOT NULL | USPS |
| `county` | `text` | |
| `latitude`, `longitude` | `double precision` NOT NULL | WGS84 |
| `geography` | `geography(Point, 4326)` | `GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED` |
| `geometry` | `geometry(Point, 4326)` | Derived for tiles |
| `nerc_region` | `text` | |
| `sector` | `text` NOT NULL | EIA sector code |
| `primary_fuel` | `text` | EIA energy-source code |
| `fuel_category` | `text` NOT NULL | See enum table (10 buckets) |
| `technologies` | `jsonb` NOT NULL DEFAULT `[]` | Array of EIA technology codes |
| `energy_sources` | `jsonb` NOT NULL DEFAULT `[]` | Array of EIA energy-source codes |
| `total_capacity_mw` | `double precision` NOT NULL | Nameplate capacity |
| `generator_count` | `integer` NOT NULL | Number of generators at the plant |
| `operating_year` | `integer` | First commercial-operation year |
| `grid_voltage_kv` | `double precision` | POI voltage |
| `status` | `text` NOT NULL | `operable` / `proposed` |
| `proposed_capacity_mw`, `proposed_online_year` | | Planned capacity in the pipeline |
| `search_vector` | `tsvector` | Weighted (name A, utility_name B, state/county C) |
| `locked_status` | `text` | |
| _provenance + audit + version_ | | |

**Indexes:** `idx_pp_slug`, `idx_pp_plant_code`, `idx_pp_utility_id`, `idx_pp_ba_id`, `idx_pp_state`,
`idx_pp_fuel_category`, `idx_pp_status`. Plus (migration DDL): GIST/SPGIST on geography, GIST on geometry,
GIN on `search_vector` and `name gin_trgm_ops`.

---

### `transmission_lines`

Metadata for US electric transmission lines from **HIFLD**. **52,244 rows.** Line geometry lives in
PMTiles for map rendering, not in this table (individual `LineString`s are large and only needed for tiles).

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `object_id` | `integer` NOT NULL | HIFLD OBJECTID |
| `type`, `status`, `owner` | `text` NOT NULL | |
| `voltage` | `double precision` | kV |
| `volt_class` | `text` NOT NULL | HIFLD class string |
| `voltage_class` | `text` NOT NULL | CommonGrid `VoltageClass` enum |
| `sub1`, `sub2` | `text` NOT NULL | Raw substation name strings from HIFLD — **use `transmission_line_endpoints` for FK-quality joins** |
| `length_miles` | `double precision` NOT NULL | |
| `naics_code` | `text` NOT NULL | |
| `locked_status` | `text` | |
| `source` | `text` NOT NULL DEFAULT `'HIFLD'` | |
| _other provenance + audit_ | | |

**Indexes:** `idx_tl_object_id`, `idx_tl_voltage_class`, `idx_tl_owner`, `idx_tl_status`,
`idx_tl_owner_trgm` GIN(`owner gin_trgm_ops`).

---

### `substations`

Every substation in the US — **60,112 rows** — merged from EIA's substations FeatureService and
OpenStreetMap (ODbL attribution), with community contributions layered on top.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug` | `text` NOT NULL UNIQUE | |
| `name` | `text` NOT NULL | |
| `owner_name` | `text` | Free-form owner string |
| `owner_utility_id` | `text` | FK → `utilities.id` ON DELETE SET NULL |
| `state` | `text` NOT NULL | |
| `county`, `latitude`, `longitude` | | |
| `geography` | `geography(Point, 4326)` | Generated from lat/lng |
| `geometry` | `geometry(Point, 4326)` | Derived for tiles |
| `min_voltage_kv`, `max_voltage_kv` | `integer` | |
| `substation_type` | `text` NOT NULL DEFAULT `'unknown'` | transmission / distribution / hybrid / unknown |
| `status` | `text` NOT NULL DEFAULT `'unknown'` | in_service / out_of_service / planned / retired / unknown |
| `source` | `text` NOT NULL DEFAULT `'manual'` | eia / osm / manual / hybrid |
| `source_url` | `text` | |
| `eia_id` | `text` | EIA substation identifier |
| `osm_id` | `text` | Prefixed: `node/123`, `way/456`, `relation/789` (ODbL — attribute OpenStreetMap contributors) |
| `hifld_legacy_id` | `text` | For reconciliation with retired HIFLD substation feeds |
| `search_vector` | `tsvector` | Weighted (name A, owner_name B, state/county C) |
| `locked_status` | `text` | |
| _provenance + audit + version_ | | |

**Indexes:** `idx_sub_slug`, `idx_sub_owner_utility_id`, `idx_sub_state`, `idx_sub_substation_type`,
`idx_sub_status`, `idx_sub_source`, `idx_sub_eia_id`, `idx_sub_osm_id`. Plus spatial (GIST/SPGIST) and
search indexes in migration DDL.

**Attribution:** rows with `source IN ('osm', 'hybrid')` include data © OpenStreetMap contributors,
licensed under [ODbL](https://www.openstreetmap.org/copyright).

---

### `transmission_line_endpoints`

Join table resolving the fuzzy `transmission_lines.sub1` / `sub2` name strings into formal FKs.

| Column | Type | Notes |
|---|---|---|
| `transmission_line_id` | `text` NOT NULL | FK → `transmission_lines.id` ON DELETE CASCADE |
| `substation_id` | `text` NOT NULL | FK → `substations.id` ON DELETE CASCADE |
| `role` | `text` NOT NULL | `from` or `to` |
| `match_confidence` | `double precision` | `0..1` — `NULL` when verified / manually curated |

**Primary key:** (`transmission_line_id`, `substation_id`, `role`).

Each line has exactly two endpoints. `match_confidence` lets downstream consumers filter on graph
quality; anything below ~0.7 is effectively provisional until a human reviews it.

---

### `ev_stations`

Every public/private EV charging site in the US, sourced from **DOE AFDC** (weekly sync). **85,425 rows.**

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug` | `text` NOT NULL UNIQUE | |
| `station_name` | `text` NOT NULL | |
| `street_address`, `city`, `state`, `zip` | `text` NOT NULL | |
| `latitude`, `longitude` | `double precision` NOT NULL | |
| `geography`, `geometry` | | Generated from lat/lng |
| `ev_network` | `text` | Network brand (Tesla, ChargePoint, EVgo, …) |
| `ev_level1_evse_num`, `ev_level2_evse_num`, `ev_dc_fast_num` | `integer` NOT NULL DEFAULT 0 | Port counts |
| `ev_connector_types` | `jsonb` NOT NULL DEFAULT `[]` | e.g. `["J1772", "CCS", "NACS"]` |
| `access_code` | `text` NOT NULL | `public` / `private` / `restricted` |
| `status_code` | `text` NOT NULL | `E` / `P` / `T` |
| `open_date` | `text` | AFDC raw date string |
| `facility_type`, `owner_type_code`, `ev_pricing` | `text` | |
| `search_vector` | `tsvector` | Weighted (station_name A, city B, street_address C) |
| _locks, provenance, audit, version_ | | |

**Indexes:** `idx_ev_slug`, `idx_ev_state`, `idx_ev_network`, `idx_ev_access`, `idx_ev_status`, plus
spatial (GIST/SPGIST) and search (GIN) indexes.

> **County caveat:** AFDC does not publish county names for EV stations. For "X chargers in Monroe
> County, NY" questions, join to `regions` via a spatial point-in-polygon or use `state` + `city`.

---

### `pricing_nodes`

Wholesale electricity pricing nodes across all 7 US ISOs/RTOs. **4,065 rows.**

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug` | `text` NOT NULL UNIQUE | |
| `name` | `text` NOT NULL | |
| `iso` | `text` NOT NULL | `CAISO` / `PJM` / `ERCOT` / `MISO` / `NYISO` / `ISO-NE` / `SPP` |
| `node_type` | `text` NOT NULL | `hub` / `zone` / `generator` / `load` / `interface` / `aggregate` |
| `latitude`, `longitude` | `double precision` NOT NULL | |
| `geography`, `geometry` | | Generated from lat/lng |
| `zone`, `state` | `text` | |
| `voltage_kv` | `double precision` | |
| `eia_plant_code` | `text` | Link to `power_plants.plant_code` when applicable |
| `locked_status` | `text` | |
| `source` | `text` NOT NULL | ISO/RTO name |
| _other provenance + audit + version_ | | |

**Indexes:** `idx_pn_slug`, `idx_pn_iso`, `idx_pn_node_type`, `idx_pn_state`, plus spatial and trigram.

---

### `programs`

Grid-flexibility programs — demand response, VPPs, DER aggregation, BYOT/BYOD, EV managed charging.
**607 rows.** Heavy JSONB for nested structures (organizations, asset types, compensation tiers, variants).

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `slug` | `text` NOT NULL UNIQUE | |
| `name` | `text` NOT NULL | |
| `description` | `text` | |
| `organizations` | `jsonb` NOT NULL DEFAULT `[]` | `[{ entityId, role }]` — role is e.g. `"sponsor"`, `"operator"` |
| `asset_types`, `market_segments`, `participation_models`, `incentive_structures`, `grid_services` | `jsonb[]` | Enum arrays |
| `regions` | `jsonb` NOT NULL DEFAULT `[]` | Array of `regions.id` |
| `compensation_tiers` | `jsonb` | `[{ tier, type, amount, unit, description? }]` |
| `capacity_target` | `double precision` | MW target |
| `max_enrollments` | `integer` | |
| `program_season` | `jsonb` | `{ startMonth, endMonth, description? }` |
| `launched_at`, `enrollment_opens`, `enrollment_closes`, `ends_at` | `text` | ISO date strings |
| `status` | `text` NOT NULL | CommonGrid `ProgramStatus` enum |
| `program_website`, `faq_url`, `terms_url`, `contact_url` | `text` | |
| `variants` | `jsonb` NOT NULL DEFAULT `[]` | Full variant objects |
| `search_vector` | `tsvector` | Weighted (name A, description B) |
| _locks, provenance, audit, version_ | | |

**Indexes:** `idx_programs_slug`, `idx_programs_status`, plus GIN on `search_vector`, `name gin_trgm_ops`,
and on each JSONB array field (`asset_types`, `grid_services`, `organizations`).

---

## Views

### `v_deprecated_utilities`

Lifecycle view (migration 0013). One row per historical or successor
utility. Consumers use it — directly via SQL, or via
`GET /api/v1/utilities/deprecated` — to reconcile an old utility name or
EIA ID back to whatever entity replaced it.

| Column | Type | Notes |
|---|---|---|
| `eia_id` | `text` | Canonical utility id (`utilities.id`). Name kept for historical spec consistency even though the column is not the EIA Utility ID number. |
| `utility_slug` | `text` | Stable public slug on commongrid.info |
| `name` | `text` | Display name |
| `status` | `text` | One of `active` \| `retired` \| `merged` \| `renamed` |
| `raw_status` | `text` | Underlying enum verbatim (`ACTIVE`/`DEFUNCT`/`MERGED`/`ACQUIRED`/`PENDING`) |
| `effective_from` | `timestamptz` | When the record first entered CommonGrid |
| `effective_to` | `timestamptz` | When it was deprecated (NULL for active) |
| `successor_eia_id` | `text` | Replacement utility id, nullable |
| `successor_slug` | `text` | Replacement utility slug, nullable |
| `source` | `text` | `'EIA-861 + manual overrides'` |
| `deprecation_reason` | `text` | Free-form note |
| `notes` | `text` | Alias of `deprecation_reason` (spec compatibility) |

**Status mapping:**
- `ACTIVE`, `PENDING` → `active`
- `DEFUNCT` without successor → `retired`
- `DEFUNCT` with successor → `renamed`
- `MERGED`, `ACQUIRED` → `merged`

Row set: every non-ACTIVE utility, plus any ACTIVE utility that is
referenced as a successor (so a single query covers both sides of the
reconciliation).

```sql
-- Reconcile a legacy EIA ID → current canonical utility
SELECT eia_id, status, successor_eia_id, successor_slug
FROM v_deprecated_utilities
WHERE utility_slug = 'gulf-power';
```

---

## Support tables

These back the community-contribution system, developer API, and moderation workflow. Consumer
dashboards and the public REST API surface only a subset of them.

| Table | Purpose |
|---|---|
| `users` | Application-level user profiles. Clerk-managed auth ID → role / stats / moderation state. Never hard-deleted. |
| `user_notification_prefs` | Per-user notification settings, keyed by `user_id`. |
| `api_keys` | Scoped API keys (SHA-256 hashes; `cg_…` prefix). Columns: `scopes text[]`, `tier` (`registered` \| `bulk`), `user_id`, rotation group, usage timestamps. |
| `api_usage_events` | Append-only per-request usage log for developer dashboards and rate-limit analytics. |
| `entity_versions` | Delta-based version history for every core entity. Normalized diff blob keyed on `(entity_type, entity_id, version)`. |
| `entity_geometry_versions` | Geometry-specific history for territories, split out so entity diffs stay small. |
| `entity_locks` | Per-entity contribution locks (`semi_locked` = limited fields, `fully_locked` = no edits). Denormalized into each entity's `locked_status`. |
| `contributions` | Community-submitted changes to any entity. State machine: `pending → approved / returned / appealed`. |
| `contribution_appeals` | Structured appeals for returned contributions. |
| `changesets` | Moderator/admin-initiated batch changes that group contributions or scripted edits. |
| `community_editable_fields` | Whitelist of which fields are safe for community editing per entity type. |
| `moderation_actions` | Audit trail of every moderator decision. |
| `moderation_response_templates` | Reusable rationale templates for moderators. |
| `discussion_threads`, `discussion_posts` | Per-entity discussion threads. |
| `entity_follows` | Who is watching which entity for notifications. |
| `notifications` | In-app notifications (fed by `user.created` / contribution state changes / etc.). |
| `knock_delivery_log` | Delivery records for outbound notifications (email / in-app). |
| `source_citations` | Free-form citation blocks attached to contributions. |
| `bulk_operations` | Idempotency records for bulk write operations (`Idempotency-Key` header). |
| `power_plant_interconnections` | Interconnection/queue snapshots where available. |

### Important support-table columns

- `api_keys`: `key_hash` (SHA-256 hex), `key_prefix` (first 8 chars of plaintext for display), `scopes`
  (`text[]` — e.g., `['utilities:read', '*:read', '*:*']`), `tier` (`registered` or `bulk`),
  `rotation_group` (used for zero-downtime rotation).
- `entity_versions`: `entity_type`, `entity_id`, `version`, `diff jsonb`, `actor_id`, `created_at`.

---

## Example queries

All examples assume `DATABASE_URL` points at CommonGrid's Neon Postgres and include the
`deleted_at IS NULL` soft-delete filter.

### Utilities

```sql
-- All active co-ops in Kentucky
SELECT slug, name, customer_count, jurisdiction
FROM utilities
WHERE segment = 'cooperative'
  AND status = 'active'
  AND jurisdiction ILIKE '%KY%'
  AND deleted_at IS NULL
ORDER BY customer_count DESC NULLS LAST;

-- Biggest IOUs by retail customer count
SELECT name, customer_count, jurisdiction
FROM utilities
WHERE segment = 'investor_owned'
  AND status = 'active'
  AND deleted_at IS NULL
ORDER BY customer_count DESC NULLS LAST
LIMIT 25;

-- Utilities with >100k customers that also generate power
SELECT name, customer_count
FROM utilities
WHERE customer_count > 100000
  AND has_generation = true
  AND status = 'active'
  AND deleted_at IS NULL;

-- Resolve a utility name with full-text search
SELECT id, name, jurisdiction,
       ts_rank(search_vector, plainto_tsquery('english', 'duke energy carolinas')) AS rank
FROM utilities
WHERE search_vector @@ plainto_tsquery('english', 'duke energy carolinas')
  AND deleted_at IS NULL
ORDER BY rank DESC
LIMIT 10;

-- Domain-based resolution (supports the resolver endpoint)
SELECT id, name, eia_id
FROM utilities
WHERE 'duke-energy.com' = ANY(domains)
  AND deleted_at IS NULL;
```

### Geospatial

```sql
-- Which territories cover a lat/lng (point-in-polygon)
SELECT r.slug, r.name, r.type
FROM territories t
JOIN regions r ON r.id = t.region_id
WHERE ST_Covers(t.geography, ST_Point(-73.98, 40.77)::geography)
  AND t.deleted_at IS NULL
ORDER BY r.type;

-- EV chargers within 25 miles of a lat/lng
SELECT slug, station_name, city, state,
       ST_Distance(geography, ST_Point(-73.98, 40.77)::geography) / 1609.34 AS miles
FROM ev_stations
WHERE ST_DWithin(geography, ST_Point(-73.98, 40.77)::geography, 25 * 1609.34)
  AND deleted_at IS NULL
ORDER BY miles ASC;

-- Power plants in a utility's service territory
SELECT pp.name, pp.fuel_category, pp.total_capacity_mw
FROM power_plants pp
JOIN utilities u ON u.slug = 'pacific-gas-and-electric-company'
JOIN territories t ON t.region_id = u.service_territory_id
WHERE ST_Covers(t.geography, pp.geography)
  AND pp.deleted_at IS NULL
  AND u.deleted_at IS NULL
ORDER BY pp.total_capacity_mw DESC;
```

### Power plants

```sql
-- Solar capacity by state
SELECT state, SUM(total_capacity_mw) AS total_mw, COUNT(*) AS plants
FROM power_plants
WHERE fuel_category = 'solar'
  AND status = 'operable'
  AND deleted_at IS NULL
GROUP BY state
ORDER BY total_mw DESC;

-- The 50 biggest battery-storage plants
SELECT name, state, total_capacity_mw, operating_year
FROM power_plants
WHERE fuel_category = 'battery'
  AND status = 'operable'
  AND deleted_at IS NULL
ORDER BY total_capacity_mw DESC
LIMIT 50;
```

### Transmission + substations

```sql
-- Substation-connectivity graph for a line
SELECT tle.role, s.name, s.state, tle.match_confidence
FROM transmission_line_endpoints tle
JOIN substations s ON s.id = tle.substation_id
WHERE tle.transmission_line_id = 'tl-12345'
  AND s.deleted_at IS NULL
ORDER BY tle.role;

-- All high-voltage transmission owned by a specific utility
SELECT object_id, voltage, length_miles, sub1, sub2
FROM transmission_lines
WHERE owner ILIKE '%duke%'
  AND voltage >= 345
  AND deleted_at IS NULL
ORDER BY voltage DESC, length_miles DESC;
```

### Programs

```sql
-- Active DR / VPP programs in a state
SELECT name, program_website
FROM programs
WHERE status = 'active'
  AND grid_services ?| ARRAY['demand_response', 'capacity']
  AND regions @> to_jsonb(ARRAY['region-st-1000'])  -- example region id
  AND deleted_at IS NULL;

-- Programs that accept a specific asset type
SELECT slug, name, organizations
FROM programs
WHERE asset_types ? 'battery_storage'
  AND status = 'active'
  AND deleted_at IS NULL;
```

### Pricing nodes

```sql
-- All ERCOT load zones
SELECT slug, name, zone
FROM pricing_nodes
WHERE iso = 'ERCOT'
  AND node_type = 'zone'
  AND deleted_at IS NULL
ORDER BY name;
```

---

## Data sources

| Source | Role | Update cadence |
|---|---|---|
| [EIA Form 860](https://www.eia.gov/electricity/data/eia860/) | Annual inventory of power plants and generators | Annual (Sept/Oct) |
| [EIA Form 860M](https://www.eia.gov/electricity/data/eia860m/) | Monthly updates to the 860 inventory | Monthly |
| [EIA Form 861](https://www.eia.gov/electricity/data/eia861/) | Annual utility sales, customers, territories | Annual |
| [EIA substations FeatureService](https://www.eia.gov/maps/layer_info-m.php) | Substation locations + voltages | Irregular |
| [HIFLD Electric Power Transmission Lines](https://hifld-geoplatform.opendata.arcgis.com/) | Transmission-line geometry + metadata | Irregular |
| [DOE AFDC](https://afdc.energy.gov/data_download) | Alternative-fuel stations, including EV charging | Weekly |
| [OpenStreetMap](https://www.openstreetmap.org/) | Community substation features (merged with EIA) | Continuous (ODbL) |
| ISO / RTO APIs | Wholesale pricing nodes — CAISO OASIS, PJM, ERCOT, MISO, NYISO, ISO-NE, SPP | Monthly |
| [Census TIGER](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | State / county boundaries | Annual |
| NRECA directory + utility websites | Utility domains, co-op affiliations | Continuous |

**Licensing:** CommonGrid data is released under the MIT license except where upstream licenses require
attribution. OpenStreetMap-derived rows in `substations` retain ODbL obligations (attribute
"© OpenStreetMap contributors"). Citation of original data sources is preserved in each row's
`source` / `source_url` columns.

---

## Changing the schema

1. Edit the relevant file under [`lib/db/schema/`](./lib/db/schema/) in a `meridian/…` branch.
2. Generate a migration with Drizzle and commit it under [`drizzle/`](./drizzle/).
3. Update this document. New columns go in the column table; new tables get their own section.
4. Run `npm run openapi` to regenerate [`public/openapi.json`](./public/openapi.json) and commit.
5. Update [`docs/api-integration.md`](./docs/api-integration.md) if the change is consumer-visible.
6. Open a PR — CI will verify the spec is in sync (`npm run openapi:check`) and the build passes.

All schema changes land on `main` with `deleted_at IS NULL` soft-delete semantics preserved.
