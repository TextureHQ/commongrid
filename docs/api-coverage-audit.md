# Public REST API coverage audit

Source review: 2026-09-25. This is a source-level inventory, not certification of every production database query.

## Public datasets

All 13 core dataset families have list and detail routes under `/api/v1`:

- Utilities, ISOs, RTOs, balancing authorities, regions, territories: route handlers query their corresponding Drizzle tables directly.
- Power plants and substations: handlers use `lib/data/power-plants-api.ts` and `substations-api.ts`; both query Postgres. Plant detail also loads interconnections; substation detail loads transmission endpoints. Those relationship tables need not be exposed as independent datasets to be accessible.
- Transmission lines, EV stations, pricing nodes, programs: handlers use their corresponding `lib/data` modules, which query Postgres.
- Rates/tariffs: `lib/data/rate-structures.ts` queries `rate_structures`. List responses omit description, energy/demand structures, schedules and net-metering rules. Detail returns these fields. There is no separate tariff table or separate tariff API to invent.

OpenAPI now documents the existing rates list/detail, utility EIA-ID lookup, deprecated-utility view and changelog batch detail. ISO/RTO/BA history shares the Grid Operators tag. The generated list envelope now matches `paginatedResponse`: `data` plus `pagination` (`cursor`, `limit`, `total`, `hasMore`), not `meta`.

`openapi-route-coverage.test.ts` inventories 49 public data route paths against the generated spec and tests rate mapper keys, pagination keys, schema references and operator grouping. It deliberately excludes authenticated collaboration/account/moderation surfaces, health and tile transport. This protects documentation coverage; it does not prove all route behavior.

## Important exceptions and remaining verification

- ISO/RTO/BA geometry serves checked-in GeoJSON, not Postgres geometry. Utility and territory geometry use PostGIS. These are different source contracts, not interchangeable assurances of database freshness.
- Changelog feed tries Postgres and falls back to checked-in changelog data on failure. Batch detail reads Postgres without that fallback.
- Global search supports only its configured entity families, not every dataset: rates, substations, regions and territories are absent. Missing database configuration and query failures become empty results. This can conceal an outage as a successful no-results response.
- Version history is not uniform across all 13 datasets. An `at` parameter or versions route must not be advertised for rates unless implemented.
- Source citations and data-source catalog tables support provenance; there is no standalone public catalog API. Decide the public read contract before adding one. Account, API-key, notification, moderation and delivery tables are not public datasets and must not be exposed for table-to-route symmetry.
- Some list routes load full matching datasets before cursor slicing; pagination correctness and scaling require seeded integration tests, not just successful compilation.
- Existing CI includes unit/contract tests and a dedicated PostGIS state-boundary suite. It is not yet an exhaustive database-backed REST API integration suite. Successful preview deployment alone does not prove filters, relationships, authorization, geometry and database-failure behavior across every route.

## Acceptance for the remaining integration audit

Use an isolated seeded database in CI (never write production). Exercise all public dataset list/detail routes; known and unknown identifiers; deleted rows; filters; cursor continuation with duplicate sort values; field projection; relationships; geometry and history; authentication/rate limits; and database failure behavior. Compare response envelopes and parameter support with OpenAPI, including existing detail-route `fields` support. Keep fixtures and migrations reviewed and reproducible. Report static-source endpoints explicitly rather than claiming everything is database backed.
