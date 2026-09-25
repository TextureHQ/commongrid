# Vermont electric service territories

Vermont PSD publishes 17 utility polygons via [VCGI MapServer layer 0](https://maps.vcgi.vermont.gov/arcgis/rest/services/PSD_services/PSD_Published_Layers/MapServer/0). The [PSD map page](https://publicservice.vermont.gov/electric-utility-service-territory-map) links the public interactive map. Layer metadata and all 17 attribute records were inspected on September 25, 2026. On that date, maintainer Victor Quinn independently confirmed that the source data is current and looks correct. This is maintainer validation, not a claim that the automated checks downloaded and compared a fresh source snapshot.

## Transformation and identity

- Fetch through the existing paginated ArcGIS adapter as GeoJSON in EPSG:4326. No `maxAllowableOffset` is requested: retain full upstream detail.
- `COMPANYNAM` maps exactly to EIA utility IDs in `scripts/lib/vermont-utility-crosswalk.ts`. Unknown names, duplicate utility features, or incomplete coverage fail the source rather than producing unlinked or partial records.
- Tests check all 17 IDs against existing Vermont rows in `data/utilities.json`. Before database publication, all IDs must resolve to existing, non-retired Vermont utilities with the expected canonical service-territory link. This checks consistency with the existing registry, not independent revalidation against original EIA filings.
- Canonical region IDs are `region-st-<EIA ID>`; polygon IDs are `territory-<EIA ID>`. No new utilities are created.
- `OBJECTID` is a source feature identifier, not an EIA ID. `Customer_Num` is intentionally not imported as current customer counts.
- Metadata describes creation in **2015** from utility-supplied data. Despite confirmation that the published data is current, retain `sourceDate: null` and `asOf: null`: neither download time nor January 1 is an established boundary observation date.
- Source priority is 100 (state source), versus 10 for HIFLD. Unmatched HIFLD coverage is retained. This change does not retroactively restore records retired by older syncs.
- The additive migration registers `vt-psd` with state authority and irregular upstream maintenance. No dataset-specific redistribution license has been established; the registry license remains null. Public access and empty copyright metadata are not license assertions.

## Publication and safety

Vermont is enabled in the existing monthly registry. The Action runs on the fifth of each month at 12:00 UTC and also supports manual dispatch from reviewed `main`. Its existing database publication happens during the job; the later manifest PR is bookkeeping, **not** an approval gate for those writes. Review and merge the publisher code before dispatching.

The publisher fails closed if any source fails. It serializes runs with an advisory transaction lock and commits region metadata, territory polygons, attribute history, spatial history, and change batches in one transaction. Invalid/empty polygons are rejected, not silently repaired. PostGIS normalizes geometry for content hashes so ring ordering does not create spurious changes. Polygon-only changes create version/changelog entries; unchanged polygons do not create spatial versions. Human-owned geometry or metadata, locked regions, missing canonical links, and retired entities abort publication rather than silently overwriting protected data.

The previous and replacement geometries are retained in `entity_geometry_versions`, linked to `entity_versions`. Prior geometry is captured before replacement; unknown historical provenance remains null. Attribute history stores a compact `geography` hash marker, not megabytes of coordinates. This makes a reviewed restorative migration possible without losing the original polygon. It is **not** a new automated rollback command: any production restoration must be a separately reviewed, tested migration/job using the recorded version, with an expected-current-version guard and a new history entry. Do not run one-off production SQL.

## Deployment verification

1. Merge only after human review and passing checks on the current PR head.
2. Confirm the Vercel deployment and migration `0036_register_vermont_boundary_source` succeeded before dispatching the Action.
3. After the Action, read back all 17 canonical links, `vt-psd` attribution, spatial versions, and change batches. Confirm Stowe (`27316`) and Morrisville (`12989`) on the map and inspect shared municipal boundaries.
4. A repeat run should create no new polygon versions unless upstream content changed. An invalid polygon or protected edit must leave metadata and geometry unchanged together.

Unit tests cover publisher behavior and SQL construction. The `state-boundaries-postgis` CI job uses a disposable PostGIS database and a least-privilege publisher role to verify create/update history, repeat-run idempotence, preservation of old polygons and unmatched coverage, and atomic rollback on invalid or human-owned geometry. The fixture covers publisher tables, not the complete migration chain. Production readback remains required verification. The development workspace could not reach the Vermont GIS host or install a local PostGIS server. No production run has been performed as part of this change.

## Broader source inventory

The state-by-state CSV expansion remains separate. Existing sources are Wisconsin (three PSC layers), Minnesota (PUC Socrata), Colorado (HIFLD fallback), and now Vermont. Michigan is not in the current registry.

## Geometry-history constraint repair

The first enabled import failed with PostgreSQL `42P10`: the live database lacked a usable unique key on `entity_geometry_versions (entity_type, entity_id, version_number)`, despite migration 0001 declaring it. The publication transaction rolled back. The original disposable fixture supplied the constraint and therefore hid this historical-schema mismatch.

Migration `0037_reconcile_geometry_history_uniqueness` restores missing uniqueness without modifying history. It accepts equivalent immediate unique indexes (including reordered keys), rejects matching deferrable keys, and refuses duplicate version keys rather than guessing which geometry to retain. It locks out concurrent history writers while checking and adding the constraint, with a five-second lock-acquisition timeout. A timeout or conflicting history fails deployment; diagnose read-only and use a separately reviewed repair rather than deleting history or repeatedly dispatching ingestion.

The PostGIS fixture now starts without the spatial-history key. Regression coverage reproduces the publisher's `42P10` failure on a pre-history polygon, confirms transaction rollback, applies the actual migration, then verifies preserved originals, successful replacement, and repeat-run idempotence. Additional cases cover equivalent/partial/nonunique indexes, repeat migration, duplicate refusal, and deferrable keys. The existing path-gated job runs these tests; unrelated PRs still do not start PostGIS.

Rollout: human review and merge, verify successful production deployment of migration 0037, then dispatch the existing sync and perform the 17-utility readback above. This migration is additive and backward-compatible; reverting application code need not remove the restored constraint. It contains no boundary-data mutation, and no manual production DDL is part of rollout.
