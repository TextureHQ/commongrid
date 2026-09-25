# Vermont electric service territories (staged, not enabled)

Vermont PSD publishes 17 utility polygons via [VCGI MapServer layer 0](https://maps.vcgi.vermont.gov/arcgis/rest/services/PSD_services/PSD_Published_Layers/MapServer/0). The [PSD map page](https://publicservice.vermont.gov/electric-utility-service-territory-map) links the public interactive map. Layer metadata and all 17 attribute records were inspected on September 25, 2026.

## Transformation and identity

- Fetch through the existing paginated ArcGIS adapter as GeoJSON in EPSG:4326. The existing adapter requests `maxAllowableOffset=0.005`; assess its loss of local detail before enabling Vermont.
- `COMPANYNAM` maps exactly to EIA utility IDs in `scripts/lib/vermont-utility-crosswalk.ts`. Unknown names fail the source rather than producing unlinked records.
- IDs are checked against existing Vermont rows in `data/utilities.json`. That is an internal consistency check, not independent EIA filing validation.
- Canonical region IDs are `region-st-<EIA ID>`, the same identifiers referenced by existing utility records. No new utility records are created.
- `OBJECTID` is a source feature identifier, not an EIA ID. `Customer_Num` is not an EIA ID and is intentionally not imported as current customer counts.
- Metadata says the layer was created in **2015** from utility-supplied data. Preserve that description but use `sourceDate: null` and `asOf: null`: neither download time nor January 1 is an established boundary vintage.
- Source priority is 100 (state source), versus 10 for the existing HIFLD fallback.

## Release gates

The registry entry has `enabled: false`; existing cron behavior is unchanged. Do not enable it until:

1. Redistribution terms are verified. Empty `copyrightText` is not a license.
2. All 17 crosswalk entries are checked against original EIA-861 filings, with citations retained; confirm canonical utility links in the database read-only.
3. Geometry is inspected for municipal/neighbour boundaries, validity, and simplification loss, especially Stowe and Morrisville.
4. Polygon changes have transactional, idempotent history and rollback coverage. The current publisher calls `applySync` for region metadata and then separately upserts PostGIS geometry. A geometry-only update does **not** currently produce the required version/changelog record, and human geometry edits are not protected by that path.
5. State-wide HIFLD retirement is reviewed: the existing publisher marks all lower-priority HIFLD regions in a successful state deleted, rather than retiring only replaced polygons. Retain upstream provenance and avoid deleting coverage for unmatched utilities.
6. A journalled migration registers `vt-psd` in `data_sources` before publishing versions referencing it.
7. A scheduled run, database/changelog readback, and map smoke test establish the end-to-end result after human review and deployment.

## Broader source inventory

The requested state-by-state CSV attachments were not readable in the task environment. No claim is made that this draft implements that inventory. Existing enabled sources are Wisconsin (three PSC layers), Minnesota (PUC Socrata), and Colorado (HIFLD fallback). Michigan is not in the current registry.

The existing workflow runs on the fifth of each month at 12:00 UTC and publishes its manifest via a data PR. No separate Vermont workflow or production write is introduced by this draft.
