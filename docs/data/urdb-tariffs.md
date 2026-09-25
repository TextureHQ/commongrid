# URDB tariff ingestion

CommonGrid imports the **complete approved US URDB bulk catalog**, including historical schedules, rather than scraping utility PDFs. This is a reference catalog, not a bill calculator, enrollment lookup, or guarantee that a plan is available today. No rates UI or tariff API is added by this ingestion change.

## Source, license, and attribution

Source: [Utility Rate Database (URDB), OEDI submission 5](https://data.openei.org/submissions/5). The publisher lists [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), permitting redistribution and adaptation with attribution. Preserve this notice in downstream APIs, downloads and rate pages:

> Rate data adapted from *Utility Rate Database (URDB)*, by Daniel Zimny-Schmitt and Jay Huggins, National Renewable Energy Laboratory, distributed through OpenEI/OEDI. Source: https://data.openei.org/submissions/5. Licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. CommonGrid extracts searchable metadata and links utilities by unique EIA ID; original structured records are retained without reinterpretation. No endorsement is implied.

The original publisher name is retained from the supplied citation. Linked utility filings have **separate rights**: we retain their URLs in `raw_record` without downloading or redistributing those documents. URDB's license does not automatically license the linked PDFs. URDB attribution must not be replaced with only CommonGrid's general dataset license.

Every tariff carries the full attribution object, source registry ID, upstream label and original-record URL. Every sync version references `data_sources.openei-urdb`. Future public tariff endpoints/exporters must carry these fields; no tariff export is added to the existing general-license weekly snapshot by this change.

## Model and transformations

- `tariffs.id = tariff-urdb-{label}`. A new upstream label is a distinct schedule; same-label revisions use the existing immutable `entity_versions` snapshot/delta history.
- Match `eiaid` (or legacy `eia`) against non-deleted database utilities' EIA IDs after numeric/leading-zero normalization. Exactly one utility is required. Missing, ambiguous and unmatched records remain in the catalog with a null `utility_id`; never infer from names or geography.
- Extract name, utility name, sector, service type, Unix-second effective/end dates (UTC ISO strings), and `supercedes` into searchable metadata. Absent values remain null. Effective dates are not observation or verification dates.
- Preserve **all** original structured values in `raw_record`: charge tiers, hourly/seasonal schedules, fixed and demand charges, eligibility/comments, upstream notices and utility source links. JSONB does not preserve whitespace or object-key order; no numeric charge conversion is performed.
- Do not infer active status from absent end dates or assign a household to a plan. Expired schedules are retained. Disappearance from a later download does **not** delete or expire a tariff.
- `entity_versions.as_of` stays null because the bulk export does not guarantee a reviewed/observed timestamp. `created_at`/`updated_at` describe actual writes. Each change batch and report records retrieval time and SHA-256 of the input bytes, distinct from effective date or verification.
- The coverage report counts matched, ambiguous, missing-EIA and unmatched records. It is not a claim of current tariff coverage, and does not yet enumerate utilities without any current schedule.

## Pipeline

`Sync URDB Tariffs` runs Tuesdays at 09:00 UTC and can be manually dispatched on `main`. It uses the existing IaC-managed `commongrid-data-sync` environment and database role; no API key or new secret is required. Migration `0032_urdb_tariffs` registers the source, creates the table and grants only SELECT/INSERT/UPDATE on that table to the existing sync role.

The checked-in importer downloads the [published gzip JSON](https://openei.org/apps/USURDB/download/usurdb.json.gz), validates the **entire** input before writes, and uses `applySync` in chunks of 250. Each chunk atomically commits the tariff changes, versions and changelog batch. A failure rolls back the current chunk, not already completed chunks. An unchanged rerun writes no tariff versions; JSONB key reordering is not a change. Human-authored fields remain protected by the shared writer.

Missing credentials, malformed/empty inputs and database failures fail the job. The workflow is included in `Data Sync Failure Alert`. Its report artifact records counts and completed batch IDs; the batches retain the input hash and attribution in the database. No raw export is committed, no direct push to `main`, no unreviewed data branch required: this is the database-native scheduled-job pattern.

### Validation and rollout

1. Review and merge the migration/importer through normal CI/CD. Never run a development copy against production with `--apply`.
2. Confirm the normal migration pipeline has applied `0032`; manually dispatch the workflow with `apply=false` (default) to validate the full live feed and database utility matching without mutation.
3. Inspect unmatched/ambiguous counts and inspect sample flat, TOU/EV, tiered and demand schedules against the original utility filings, including PG&E. Imported is not independently verified.
4. Dispatch with `apply=true`; confirm changed tariffs, attributed versions and collapsed changelog entries. Rerun identical input in a disposable database and confirm zero new versions.
5. Leave the weekly schedule enabled only after the first import has been validated. A failed/partial run is an incident, not proof of freshness.

Local commands (use a disposable database for write tests):

```sh
# Offline read-only validation, without any database credential
npx tsx scripts/sync-urdb.ts --file /tmp/usurdb.json.gz
# Live download, read-only; if DATABASE_URL is set it is used only for utility lookup
npx tsx scripts/sync-urdb.ts
# Explicit write mode, for a disposable database with the migrations applied
npx tsx scripts/sync-urdb.ts --file /tmp/usurdb.json.gz --apply
```

### Recovery and rollback

- Stop further imports by reverting/disabling the schedule through a reviewed workflow change. Keep the additive table, source registration and version history; reverting application code does not require dropping data.
- Transient failure: rerun the same file via the checked-in job. Completed chunks are idempotent and the failed chunk is transactional.
- Bad upstream data: use the report's batch IDs and the existing version snapshots/deltas to prepare a **reviewed compensating migration/job**, restoring prior values while preserving audit history. Do not manually update production or delete version rows. No blanket destructive down migration is provided.
- Reverting the feature must retain source attribution and history for already imported data.

## Initial verification boundary

The source page and API schema were inspected. The development sandbox could not download the live gzip file (connection reset), so the checked-in tests use explicitly synthetic structures, **not a claimed PG&E sample**. Live bulk compatibility, source-vs-filing comparisons, database integration and production changelog behavior remain rollout gates. Keep the PR in draft until live-feed and database validation succeed. The Rates placeholder is unchanged by this ingestion-only PR.
