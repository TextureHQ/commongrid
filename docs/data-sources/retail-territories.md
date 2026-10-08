# Derived retail territory display layer

CG-219 separates the interactive retail map from upstream, as-filed geometry.
This is a **cartographic precedence rule**, not a regulatory finding that an
address legally belongs to the selected utility. Partial overlaps remain data
review candidates; do not use these tiles for eligibility or billing.

## Sources and transformation

- Inputs are the existing `territories.geography` records, joined through each
  active, non-deleted utility's `service_territory_id`. Retain each territory's
  `source` and `source_url` in the export; no upstream boundary is overwritten.
- Upstream national coverage comes from [HIFLD](https://hifld-geoplatform.opendata.arcgis.com/),
  with state overrides such as [Vermont PSD](https://publicservice.vermont.gov/electric-utility-service-territory-map).
  This change tests the transformation against synthetic PostGIS fixtures; it
  does not claim a new nationwide comparison with original regulatory filings.
- Include IOUs, distribution cooperatives, municipal utilities and political
  subdivisions. Exclude known WAPA (EIA 27000) and BPA (EIA 1738) marketing
  footprints. [DOE describes their power-marketing role](https://www.energy.gov/ea/power-marketing-administrations).
  This is a display exclusion only, not organization reclassification. No
  blanket USBIA/TDX exclusion is made without individual retail-role review.
- Repair invalid polygon geometry with `ST_MakeValid` in temporary tables only,
  retaining polygonal components; omit empty geometries. Compute spherical area
  for ordering. A GiST index on the temporary geometry makes candidate joins
  spatially bounded without relying on unpopulated production mirror columns.
- Subtract the union of smaller original polygons from each enclosing or
  intersecting larger polygon. The ordering is `(geodesic area, utility ID,
  territory ID)`; ties are deterministic. Subtracting original polygons is
  equivalent to smallest-first assignment even for three-deep nesting.
- Topologically equal polygons across different utility IDs have no defensible
  owner. Withhold all such records, record their IDs in the audit, and subtract
  their footprints from remaining polygons too. These deliberate coverage gaps
  must be resolved from better upstream data, not silently filled by an IOU.
- Preserve source provenance and `territoryId` in properties; promote `slug` as
  the map feature ID so all fragments of a utility share hover state. Existing
  detail/API boundaries remain as-filed and may therefore differ from the map.

## Verification and publication

`prepare-territory-geojson.mjs` performs one repeatable-read transaction using
session-local temporary tables. `derive-retail-territories.sql` builds the layer;
`audit-territory-overlap.sql` records geodesic sum/union ratios and withheld IDs.
The audit covers the actual export population (including Alaska), not the
historical lower-48-only sample in CG-219. Geodesic ratios can differ slightly
from 1 after planar polygon splitting; exact topology is tested separately.

Run the integration test against a disposable local `boundary_test` database
with PostGIS using `SNAPSHOT_TEST_DATABASE_URL`. CI runs it in the existing
PostGIS service. Fixtures verify nested municipal/co-op/IOU polygons, partial
intersection, shared-placeholder quarantine, union conservation outside that
quarantine, and byte-for-byte preservation of original geometries.

The `Rebuild retail territory tiles` workflow runs from reviewed main on changes
to the exporter and supports manual dispatch after source refreshes. It uploads
the audit and opens a separate artifact PR; it never writes to main or auto-merges.
Review audit coverage and withheld records before merging that PR. The shared-node
Tippecanoe option preserves common boundaries during simplification. Small polygon
reduction is disabled; low zooms still cannot communicate address-level precision.

**Merging exporter code alone does not change the shipped tile archive.** Verify
the artifact PR's Vercel production deployment, then check Colorado retail clicks,
Alger-Delta inside UPPCO, municipal carve-outs, Wells/Ely outlines, mobile taps,
filters, detail navigation and back navigation. Until those checks complete,
CG-219 is not Done. Roll back through a reviewed revert of the artifact and/or
code PR; no source-data restoration is needed because source records are unchanged.

Remaining data stewardship: investigate equal-placeholder clusters and duplicate
organizations from the audit, and validate precedence for partial overlaps against
authoritative local sources. Federal classification and classification editing
are separate work, as requested by Victor.
