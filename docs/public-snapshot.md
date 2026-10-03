# CommonGrid Public Snapshot

The weekly snapshot workflow publishes a public, allowlisted SQL dump plus map-layer GeoJSON assets.

## Included in the public SQL dump

- `public.balancing_authorities`
- `public.ev_stations`
- `public.isos`
- `public.power_plant_interconnections`
- `public.power_plants`
- `public.pricing_nodes`
- `public.programs`
- `public.regions`
- `public.rtos`
- `public.substations`
- `public.territories`
- `public.transmission_line_endpoints`
- `public.transmission_lines`
- `public.utilities`

## Not included

Private, operational, or user-linked tables are intentionally excluded from the public snapshot, including:

- `users`
- `api_keys`
- `notifications`
- `user_notification_prefs`
- `knock_delivery_log`
- `contributions`
- `contribution_appeals`
- `moderation_actions`
- `discussion_posts`
- `api_usage_events`
- `entity_locks`
- `bulk_operations`

## License

The snapshot is released under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/).

## Contract

If a dataset should be part of the public snapshot, it must be added to the workflow allowlist explicitly. New tables are excluded by default.

## Download formats and coverage

Downloads use GitHub release assets; each release lists only the files it actually
contains. Old releases are not retroactively expanded. `.sql.gz` is gzipped plain
SQL: restore with `gunzip -c commongrid-YYYY-MM-DD.sql.gz | psql your_database`
into a database with PostGIS installed. It is not `pg_restore` custom format.

New snapshots export the following GeoJSON FeatureCollections from Postgres:

- `utilities`: utility metadata joined through `service_territory_id` to regions
  and territory geography. Includes `region_id` for joins.
- `territories`: **all** stored active region boundaries, not just those linked
  to utilities (including state and operator regions where present).
- `ev-stations`, `power-plants`, `pricing-nodes`, `substations`: points made from
  stored longitude/latitude in WGS84, in that coordinate order.
- `transmission-lines`: stored PostGIS line geometry, not reconstructed endpoints
  or simplified map tiles.
- `balancing-authorities`, `isos`, `rtos`: each operator's linked region geometry.

GeoJSON omits deleted entities and records without geometry/valid coordinates;
it does not fabricate boundaries, geocode missing points, or promise complete
upstream coverage. No simplification or territory-overlap correction is applied.
Each feature retains a public ID and source/source URL; joined boundaries also
retain their geometry source. Validation parses every artifact and checks IDs,
non-empty collections, geometry structure and coordinate bounds before publishing.

Programs and rates are **relational JSON, not GeoJSON**. Programs retain their
`organizations` and `regions`; rates retain `utility_id`, `region_id`, `eia_id`,
schedules and source attribution. Join these to spatial layers when appropriate,
but a utility territory alone does not establish tariff or program eligibility.
`programs.json.gz` is also represented in the existing SQL allowlist. Rates ship
as `rates.json.gz`; `rate_structures` is not yet in the SQL dump allowlist. These
JSON projections explicitly exclude moderation identities and internal audit data.

## Upstream provenance and attribution

- Utilities and territories: [EIA](https://www.eia.gov/electricity/data/eia861/),
  [HIFLD](https://hifld-geoplatform.hub.arcgis.com/), and the source cited by each region.
- Plants: [EIA-860/860M](https://www.eia.gov/electricity/data/eia860m/).
- Charging stations: [AFDC](https://afdc.energy.gov/stations/).
- Transmission: HIFLD; substations: EIA and
  [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
- Operator boundaries and pricing nodes: the ISO/RTO/BA source cited on each record.
- Rates: [OpenEI Utility Rate Database](https://openei.org/wiki/Utility_Rate_Database)
  and per-record `attribution`, `source_url` and `upstream_record_url`.
- Programs: the source/source URL of each curated record.

The compilation's ODbL license does not replace upstream attribution obligations.
Retain source fields and consult the linked source terms when redistributing.
