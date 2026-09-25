# Source registry and version provenance

`data_sources` is the public upstream catalog. Migration
`0028_data_sources_version_provenance.sql` seeds the nine initial source keys:
`eia-861`, `hifld-rsts`, `eia-860m`, `co-puc`, `mn-gisdata`, `wi-psc`,
`manual`, `community`, and `derived`. Each row has a display name, authority
tier, expected publication cadence, homepage, nullable license, and active flag.
The migration records catalog URLs; they are not downloaded release URLs.
A null license means **unverified**, not permission to redistribute.
State and HIFLD cadences remain irregular until an adapter verifies a schedule.

## Version contract

Both `entity_versions` and `entity_geometry_versions` have a `source_id` foreign
key and nullable `as_of` timestamp. A referenced source cannot be deleted;
retire it with `is_active = false` instead. These are version-level metadata,
not columns on individual entity fields. Existing snapshot/delta history
remains the per-field provenance store.

Every `SyncRecord` must explicitly supply `sourceId` and `asOf: Date | null`.
The writer rejects missing/malformed provenance before opening a transaction;
the foreign key rejects unregistered sources transactionally. `sourceId` names
the upstream; `initiatedBy` still names the actor. `asOf` is the upstream
observation period, **never** the fetch, ingest, or moderation timestamp.
Create and update versions retain that metadata; unchanged records still
produce no version, even if the source now advertises a newer vintage.
This is change provenance, not an observation ledger.

Community changes use `community`; administrator changes use `manual`.
Their vintage stays null because the contribution contract does not yet collect
an observation date. Historical rows, legacy seeds, and synthetic baselines
also retain null provenance rather than attributing old values to the source
that happens to trigger the next update. There is no guessed historical backfill.
Geometry columns are available for future spatial writers; no geometry writer
is introduced here.

## Monthly EIA mapping

The existing [EIA-860M adapter](https://www.eia.gov/electricity/data/eia860m/)
normalizes the workbook's reporting month to the first day of that month at
00:00 UTC (month precision, not a claimed daily observation). Only plants in
the parsed operating/planned generator aggregates are published to Postgres.
The merged tile dataset also retains historical plants absent from the workbook;
those must not be stamped with a new vintage. Existing plants still receive
only the adapter's declared generator fields. Create snapshots include required
identity metadata from the existing merged dataset, so their source describes
the producing adapter, not independent verification of every inherited field.

## Rollout and recovery

The migration is additive and forward-only through the normal deployment
pipeline. Both new columns are nullable for compatibility with historical rows
and existing writers. Reverting application code is safe with the migration
left in place; it simply stops adding provenance. Do not drop the registry or
columns to roll back an application release, or provenance would be lost.
No production backfill or manual database mutation is required.

Authority precedence, authority scopes, inactive-source enforcement, and stale
human-override handling are **not** implemented by this registry change; they
belong to CG-287. Policy B continues to preserve human-authored fields.

## Utility Rate Database

The [URDB tariff importer](./urdb-tariffs.md) registers `openei-urdb`, preserves
CC BY 4.0 attribution on every tariff, and links all sync versions to that source.
Effective dates and retrieval timestamps must not be reported as verification dates.
