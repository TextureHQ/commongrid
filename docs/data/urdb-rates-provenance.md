# URDB rate structures: provenance and reconciliation

## One catalog and one scheduled importer

[PR #488](https://github.com/TextureHQ/commongrid/pull/488) established `rate_structures`, source `urdb`, `scripts/sync-urdb-rates.ts`, and the weekly API-based workflow. It uses `applySync` for version history and human-field protection. Its V1 scope is approved, unexpired Residential/Commercial schedules with known utility EIA IDs. The checked-in run manifest reports 19,372 creations; this document is not independent verification of production state.

The superseded [PR #487](https://github.com/TextureHQ/commongrid/pull/487) proposed a second `tariffs` table, source `openei-urdb`, and bulk-download schedule. Do not merge that implementation alongside the existing catalog. Its broader all-sector/historical/unmatched-record coverage is deferred. Neither backend PR implements the Rates UI or a public rates endpoint.

CG-307 carries only additive improvements into the existing implementation:

- `raw_record` preserves the complete returned API object, including demand schedules, eligibility text, notices and fields not projected into explorer columns. JSONB does not preserve whitespace or key order; this is not a byte-identical archival copy.
- `upstream_record_url` identifies the OpenEI record using its stable label. `source_url` and `source_parent_url` remain upstream utility references; linked PDFs are not downloaded or republished.
- `attribution` stores source, publisher, source/documentation/license links, the qualified license notice, transformation description and no-endorsement disclaimer. Future manifests include the same attribution. Consumers must carry it through into UI/API/download presentations; those surfaces are not implemented here.
- Duplicate EIA utility IDs no longer select an arbitrary database row. Unknown and ambiguous utilities are skipped under the existing V1 policy and counted together in `unknown_utility`. Duplicate region EIA IDs leave `region_id` null. Only unique joins are made; names are not fuzzy-matched.
- `entity_versions.as_of` is null for new sync versions: tariff effective dates are not upstream observation or verification dates. `start_date` / `end_date` retain their original meaning. Existing history is not rewritten. Manifest generation time and entity write timestamps are not a tariff freshness certification.
- Shared `applySync` comparison ignores JSON object key ordering on both sides, while preserving array order, so PostgreSQL JSONB key reordering does not create spurious versions. Human-locked fields still use the existing deferral policy, including previously authored relationship values.

## Credit and license evidence

Source: [OpenEI Utility Rate Database](https://openei.org/wiki/Utility_Rate_Database), distributed through OpenEI with U.S. Department of Energy support.

The shipped importer consumes the [URDB API](https://apps.openei.org/services/doc/rest/util_rates/?version=8), **not** the OEDI bulk download. OpenEI's [API documentation](https://apps.openei.org/services/doc/rest/util_rates/?version=7) states: “Content is available under Creative Commons Zero unless otherwise noted.” Retain that qualification alongside the [CC0 1.0 link](https://creativecommons.org/publicdomain/zero/1.0/); it is not a guarantee that every linked utility document is unrestricted. The existing `data_sources.license = CC0` remains unchanged, supplemented by the qualified per-record notice.

The earlier bulk proposal cited CC BY 4.0 on the [OEDI dataset submission](https://data.openei.org/submissions/5). That separate distribution's licensing must be revalidated before changing feed or license metadata. Direct access to that submission was reset in the development sandbox during reconciliation; do not treat the previous bulk claim as verified evidence for the current API feed.

Example credit, with source/record/license links rendered by the consumer:

> Rate data from the OpenEI Utility Rate Database (URDB). API documentation states CC0 unless otherwise noted. CommonGrid normalizes fields, derives explorer flags and links unique EIA utility IDs; the original API record is retained. Linked utility documents retain their own terms. No endorsement is implied.

The restriction-text heuristic is **not a license audit**. Preserve original source-side notices and investigate questionable records rather than declaring them legally cleared. Imported schedules are not checked household enrollment, billing quotes, or independently verified current utility filings.

## Migration, refresh and recovery

Migration `0033_rate_structure_provenance.sql` adds three nullable columns. Existing records remain null until observed by the normal scheduled importer; expired or otherwise filtered records are not backfilled by this change. Do not edit the already-shipped migration or run an ad-hoc production backfill.

After normal reviewed deployment applies the migration, the existing sync writes new fields and their history through `applySync`. The first refresh should add provenance versions; identical subsequent inputs should not add versions solely because of JSON key order. No extra schedule, credential, source registration or table is introduced.

Validate in a disposable database before merge: apply the existing table migration followed by `0033`, verify old rows survive with null new columns, and round-trip representative raw structures through JSONB. Unit tests cover mapper retention, ambiguous joins, observation/effective date separation, and actual shared-writer change detection. Full production imports, tariff-vs-filing spot checks and deployment verification are separate rollout checks, not claimed by these tests.

Rollback application code through a reviewed revert, leaving additive columns and version history intact. If a sync produces incorrect data, disable its schedule through review and prepare a compensating migration/job using recorded versions; never manually overwrite production or delete history.
