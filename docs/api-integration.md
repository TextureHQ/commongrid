# CommonGrid API Integration Guide

> A practical guide for developers integrating the public [CommonGrid](https://commongrid.info) REST
> API server-to-server. For the underlying data model, see [`DB-SCHEMA.md`](../DB-SCHEMA.md). For a
> machine-readable spec, see [`public/openapi.json`](../public/openapi.json) (OpenAPI 3.1).

---

## Contents

- [Base URL](#base-url)
- [Authentication](#authentication)
- [Rate limits](#rate-limits)
- [Pagination](#pagination)
- [Sparse fieldsets](#sparse-fieldsets)
- [Cache headers](#cache-headers)
- [Error model](#error-model)
- [Endpoints](#endpoints)
  - [Utilities](#utilities)
  - [Territories](#territories)
  - [ISOs, RTOs, and Balancing Authorities](#isos-rtos-and-balancing-authorities)
  - [Regions](#regions)
  - [Power plants](#power-plants)
  - [Transmission lines](#transmission-lines)
  - [Substations](#substations)
  - [EV charging stations](#ev-charging-stations)
  - [Pricing nodes](#pricing-nodes)
  - [Programs](#programs)
  - [Search & changelog](#search--changelog)
  - [Vector tiles](#vector-tiles)
- [Resolver endpoint (POST)](#resolver-endpoint-post)
- [Bulk batching patterns](#bulk-batching-patterns)
- [Versioning policy](#versioning-policy)
- [Deprecations & change log](#deprecations--change-log)

---

## Base URL

All v1 endpoints live under:

```
https://commongrid.info/api/v1
```

The API speaks JSON. Every response is `Content-Type: application/json; charset=utf-8` unless noted.

CORS is enabled for all origins on `GET` routes. `POST` routes (currently only `/utilities/resolve`)
also allow cross-origin calls.

---

## Authentication

CommonGrid is a public dataset. **Every route is callable anonymously.** Authentication exists for
two reasons only:

1. **Higher rate limits.** Authenticated callers get 5,000 requests/hour (Registered) or 50,000 (Bulk)
   instead of 60/hour anonymous.
2. **Write scopes** (future). The API-key model supports scoped writes (`utilities:write`, `*:*`, etc.)
   for trusted contributors and bulk sync clients. At the time of writing, all write endpoints are
   still curated via the community-contribution flow — but the auth plumbing is already live.

> **One auth model for everyone.** Server-to-server clients authenticate with the same public API-key
> scheme as every other v1 route. There are no internal-only endpoints, no special role classes, and
> no backchannel auth. If you're reading this, you have access to the same surface as anyone else.

### Getting a key

API keys are issued through the [Developer Dashboard](https://commongrid.info/developers). Sign in
with a CommonGrid account, click **Create API key**, and store the plaintext key returned at
creation — it's shown **once** and never again (CommonGrid only stores a SHA-256 hash).

Keys look like:

```
cg_a1b2c3d4-e5f6-7890-abcd-0123456789ab
```

Each user can hold up to **10 active keys** at a time. Keys carry:

| Field | Description |
|---|---|
| `name` | Human label for your dashboard. |
| `scopes` | Scopes the key holds, e.g. `['utilities:read']`, `['*:read']`, `['*:*']`. |
| `tier` | `registered` (default) or `bulk` (available on request for >5k req/hr). |
| `expires_at` | Optional expiry — unset means the key lives until revoked. |
| `rotation_group` | Shared across overlapping keys so you can rotate without downtime. |

### Using a key

Send the key as a Bearer token — this is the **only** accepted credential form:

```http
Authorization: Bearer cg_a1b2c3d4-e5f6-7890-abcd-0123456789ab
```

```bash
curl -H "Authorization: Bearer $CG_KEY" \
  "https://commongrid.info/api/v1/utilities?segment=cooperative&state=KY"
```

The server looks up the SHA-256 of the key in `api_keys`, checks `is_active` and `expires_at`, verifies
the scope matches the requested resource+action (e.g., `utilities:read` or `*:read`), and rate-limits
by the key's tier. `lastUsedAt` is updated fire-and-forget on every request.

**Unsupported credentials**

| Presented as | Behavior |
|---|---|
| No `Authorization` | Anonymous tier (public reads). |
| `Authorization: Bearer <valid cg_ key>` | Registered / bulk tier for that key. |
| `Authorization: Bearer <unknown / revoked / empty>` | `401 UNAUTHORIZED`. |
| `Authorization: Basic …`, raw token without a scheme, or any other scheme | `401 UNAUTHORIZED` (malformed credentials). |
| `X-API-Key: …` | **Ignored.** Does not authenticate, elevate, or 401. Use Bearer instead. |

### Rotating a key

Use the `rotation_group` field: create the new key with the same `rotation_group` as the old one,
deploy the new plaintext to your clients, then deactivate the old key. Both keys remain valid until
you revoke the old one.

### Scope matching rules

```
utilities:read    → matches exactly that action on that resource
utilities:*       → matches any action on 'utilities'
*:read            → matches 'read' on any resource
*:*               → matches everything
```

---

## Rate limits

Limits are enforced per key (authenticated) or per IP (anonymous). Both an **hourly** window and a
short **burst** window apply.

| Tier | Hourly | Burst | How to get it |
|---|---:|---|---|
| `anonymous` | 60 req/hr | 10 req/min | No key required. |
| `registered` | 5,000 req/hr | 100 req/min | Any active API key. |
| `bulk` | 50,000 req/hr | 500 req/min | API key with `tier = 'bulk'`. Contact us to upgrade. |
| `write` | 100 req/min | — | Applied automatically to any mutating request (currently `POST /utilities/resolve`). |

Every response includes the usual [`RateLimit-*`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) headers plus CommonGrid's own:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Limit for the active window. |
| `X-RateLimit-Remaining` | Requests left before throttling. |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets. |
| `X-RateLimit-Tier` | Tier that was applied (`anonymous` / `registered` / `bulk` / `write`). |
| `Retry-After` | Seconds to wait, set only on 429 responses. |

When you exceed a window you get a `429 RATE_LIMITED` error (see [Error model](#error-model)).

---

## Pagination

List endpoints use **HMAC-signed cursor pagination** (keyset, not offset).

Response envelope:

```json
{
  "data": [ /* rows */ ],
  "pagination": {
    "cursor": "eyJ2IjoxLCJzIjp7InZhbHVlIjoiYWJjIn0sImlkIjoidXRpbC1lL…",
    "limit": 50,
    "total": 3133,
    "hasMore": true
  }
}
```

To fetch the next page:

```bash
curl "https://commongrid.info/api/v1/utilities?cursor=$CURSOR&limit=50"
```

- `limit` — default `50`, max `200`.
- `cursor` — opaque string from the previous response's `pagination.cursor`. Cursors are HMAC-signed;
  forged cursors are rejected with `400 BAD_REQUEST`.
- `sort` and `order` — per-endpoint; see each endpoint below for supported values. Changing `sort`
  invalidates an existing cursor.

`total` reflects the row count **after filters** but **before cursor application** — in other words,
the total number of rows the query would return without pagination.

---

## Sparse fieldsets

Every list and detail route accepts `fields=` to return only the columns you need:

```bash
curl "https://commongrid.info/api/v1/utilities/duke-energy-carolinas-llc?fields=id,slug,name,eiaId,customerCount"
```

Use this to cut payload size when integrating in bandwidth-sensitive contexts (mobile, serverless).
Internal / unsafe fields (`search_vector`, etc.) are always stripped before projection.

---

## Cache headers

CommonGrid's data is rarely real-time, so every read route sets aggressive CDN caching. The table
below summarizes current values; see each endpoint for per-route nuance.

| Route class | `Cache-Control` | Notes |
|---|---|---|
| Entity list (utilities, territories) | `public, s-maxage=300, stale-while-revalidate=600` | 5 min fresh, 10 min stale. |
| Entity detail (utilities, power-plants, etc.) | `public, s-maxage=3600, stale-while-revalidate=86400` | 1 h fresh, 1 d stale. |
| List (substations, transmission, pricing-nodes) | `public, s-maxage=60, stale-while-revalidate=300` | Faster refresh for write-in-flight data. |
| GeoJSON / geometry endpoints | `public, s-maxage=86400, stale-while-revalidate=86400` | Also sets `Cache-Tag` for purging. |
| `POST /utilities/resolve` | `no-store` | Response is body-parameterized; intermediate caches can't key on it. |
| `/me`, `/developer/*` | `no-store` | Private, per-key. |

Responses include `ETag` when a stable hash is cheap to compute; pair with `If-None-Match` for
304 responses on detail routes.

---

## Error model

Every error returns a consistent envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Utility 'nonexistent-utility' not found",
    "request_id": "req_8b2c3d4e5f67",
    "timestamp": "2026-05-08T20:15:22.412Z"
  }
}
```

| HTTP | `code` | Meaning |
|---:|---|---|
| 400 | `BAD_REQUEST` | Malformed request (bad JSON, missing required field, invalid cursor). |
| 400 | `VALIDATION_ERROR` | Input failed validation (bad state code, out-of-range number, too long). |
| 401 | `UNAUTHORIZED` | Missing `Authorization` when required, or present-but-invalid credentials (unknown / revoked key, empty Bearer, non-Bearer scheme). |
| 403 | `FORBIDDEN` | Key is valid but lacks the required scope. |
| 404 | `NOT_FOUND` | Entity does not exist (or has `deleted_at IS NOT NULL`). |
| 409 | `CONFLICT` | Write-side conflict (duplicate idempotency key, optimistic-lock miss). |
| 429 | `RATE_LIMITED` | Window exceeded; see `Retry-After`. |
| 500 | `INTERNAL_ERROR` | Unexpected server failure. Include `request_id` when filing a bug. |

Every response (success or error) includes an `X-Request-Id` header. Echo it back when reporting
issues — it's the fastest way to pinpoint the request in server logs.

---

## Endpoints

All paths below are relative to `https://commongrid.info/api/v1`. Unless noted, method is `GET`.

### Utilities

#### `GET /utilities`

List utilities with rich filtering, sorting, cursor pagination, and sparse fieldsets.

**Common filters**

| Param | Type | Description |
|---|---|---|
| `segment` | enum | `investor_owned`, `municipal`, `cooperative`, `federal`, `state`, `political_subdivision`, `cca`, `retail`, `wholesale`, `other`. |
| `status` | enum | `active`, `inactive`, `merged`, `retired`. |
| `state` | string | Two-letter USPS code; matches `jurisdiction ILIKE '%XX%'`. |
| `iso`, `rto`, `ba` | string | Filter by `iso_id` / `rto_id` / `balancing_authority_id`. |
| `search` / `q` | string | Full-text against name, eia_name, short_name, jurisdiction (weighted). |
| `hasGeneration` / `hasTransmission` / `hasDistribution` | `true`\|`false` | Capability flags. |
| `lat`, `lng` | number | Point-in-polygon across service territories (both required together). |

**Bulk / numeric / presence filters**

| Param | Type | Description |
|---|---|---|
| `eiaIds` (aliases: `eia_ids`) | csv | Up to **500** EIA Utility IDs per request. |
| `minCustomers` / `maxCustomers` | int | Bounds on `customer_count`. |
| `minAmiMeters` / `minTotalMeters` | int | Bounds on meter counts. |
| `hasLogo` / `hasWebsite` / `hasTerritory` | bool | Presence flags — useful for filling coverage gaps. |

snake_case equivalents (`min_customers`, `has_logo`, etc.) are accepted.

**Pagination + presentation**

| Param | Values | Default |
|---|---|---|
| `sort` | `name`, `customerCount`, `segment`, `slug` | `slug` |
| `order` | `asc`, `desc` | `asc` |
| `limit` | 1–200 | 50 |
| `cursor` | opaque | — |
| `fields` | csv | all |
| `include` | csv: `iso`, `rto`, `ba` | none |

**Example**

```bash
# All active co-ops in KY, sorted by customer count
curl "https://commongrid.info/api/v1/utilities?segment=cooperative&status=active&state=KY&sort=customerCount&order=desc"

# Bulk lookup: 3 utilities by EIA ID, only the fields we need
curl "https://commongrid.info/api/v1/utilities?eiaIds=3046,19791,20388&fields=id,slug,name,eiaId,customerCount"
```

Response:

```json
{
  "data": [
    {
      "id": "util-eia-3046",
      "slug": "duke-energy-carolinas-llc",
      "name": "Duke Energy Carolinas, LLC",
      "eiaId": "3046",
      "customerCount": 2812345
    }
  ],
  "pagination": {
    "cursor": null,
    "limit": 50,
    "total": 3,
    "hasMore": false
  }
}
```

**Cache:** `public, s-maxage=300, stale-while-revalidate=600` · **Tier:** list.

#### `GET /utilities/{slug}`

Single utility by slug. Supports `?include=iso,rto,ba` and `?fields=...`. Returns `404 NOT_FOUND` if
missing or soft-deleted.

```bash
curl "https://commongrid.info/api/v1/utilities/duke-energy-carolinas-llc?include=iso,ba"
```

**Cache:** `public, s-maxage=3600, stale-while-revalidate=86400`.

**Successor following.** When the row matched by `slug` has
`status` of `MERGED` or `ACQUIRED` and a non-null `successor_id`, the
response body returns the *successor's* data (so consumers transparently
receive the live canonical record at the historical URL). The response
includes:

- `_redirected_from`: `{ from_slug, from_status, reason }` describing the
  deprecated row the request was redirected from.
- HTTP `Link: </api/v1/utilities/{successor_slug}>; rel="canonical"` header.

This preserves stable URLs for historical slugs while giving consumers the
current canonical data. To opt out and get the deprecated row verbatim
(useful for audit, debugging, or lifecycle tooling), pass
`?follow_successor=false`. Use [`GET /utilities/deprecated`](#get-utilitiesdeprecated)
to enumerate deprecated rows directly.

#### `GET /utilities/by-eia-id/{eiaId}`

Same response shape as `{slug}` but looked up by the canonical EIA Utility ID. Use this when you
already store EIA IDs upstream and don't want to translate to slugs first.

```bash
curl "https://commongrid.info/api/v1/utilities/by-eia-id/3046?include=iso"
```

**Cache:** `public, s-maxage=3600, stale-while-revalidate=86400`.

#### `GET /utilities/{slug}/geometry`

Returns the utility's service-territory polygon as a GeoJSON `FeatureCollection`.
The endpoint resolves `utilities.slug` → `regions` (`SERVICE_TERRITORY`) →
`territories` server-side, so consumers only need a utility slug (no need to
look up the region or territory id first).

```bash
curl "https://commongrid.info/api/v1/utilities/green-mountain-power/geometry"
curl "https://commongrid.info/api/v1/utilities/green-mountain-power/geometry?simplify=0.05"
```

**Response is always a flat `FeatureCollection` with a top-level `metadata`
block** — *not* a `{ data: ... }` envelope. Branch on `metadata.geometry_status`
to distinguish the three states:

*200 — `geometry_status: "loaded"`* (utility exists and the polygon is available):

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "MultiPolygon", "coordinates": [ … ] },
      "properties": {
        "utility_slug": "green-mountain-power",
        "utility_name": "Green Mountain Power",
        "eia_id": "7601",
        "region_slug": "st-green-mountain-power-corp-7601",
        "territory_id": "territory-7601"
      }
    }
  ],
  "metadata": {
    "utility_slug": "green-mountain-power",
    "utility_name": "Green Mountain Power",
    "eia_id": "7601",
    "region_slug": "st-green-mountain-power-corp-7601",
    "territory_id": "territory-7601",
    "geometry_status": "loaded",
    "source": "HIFLD ArcGIS",
    "source_url": "https://hifld-geoplatform.opendata.arcgis.com/…",
    "area_sq_km": 24906.5,
    "updated_at": "2026-03-01T00:00:00.000Z"
  }
}
```

*200 — `geometry_status: "pending_backfill"`* (utility exists but its territory
polygon has not been ingested yet — rare as of 2026-05-08, but expected any time
a newer EIA-861 filing adds a utility before its polygon lands):

```json
{
  "type": "FeatureCollection",
  "features": [],
  "metadata": {
    "utility_slug": "some-new-coop",
    "eia_id": "99999",
    "region_slug": "st-some-new-coop-99999",
    "geometry_status": "pending_backfill",
    "source": null
  }
}
```

> **Why empty-200 instead of 404 for pending?** An empty `FeatureCollection` is
> a no-op on `mapboxgl.Map.addSource`, so clients get graceful degradation for
> free — just branch on `metadata.geometry_status` and skip `addLayer` when
> `features.length === 0`. The `404` shape stays reserved for unknown slugs,
> so consumers never have to parse error codes to distinguish “bad slug” from
> “known utility, geometry coming soon.”

*404 — utility slug not in the registry:*

```json
{ "error": "utility_not_found", "slug": "…" }
```

**Content-Type:** `application/geo+json`.

**Cache:**

| State | `Cache-Control` | Rationale |
|---|---|---|
| `loaded` | `public, max-age=3600` | Territories are effectively static between sync runs. |
| `pending_backfill` | `public, max-age=300` | Tight window so backfills propagate quickly once the polygon lands. |
| `utility_not_found` | `public, max-age=60` | Minimal caching. |

`ETag: sha256(utility_id | geometry_status | updated_at)` — flips the moment a
pending utility becomes loaded, so `If-None-Match` / CDN caches invalidate
cleanly with no client purge.

**Query params**

| Param | Description |
|---|---|
| `simplify` | Topology-preserving simplification tolerance in degrees (default `0.01`, higher = simpler). |

#### `POST /utilities/resolve`

See [Resolver endpoint (POST)](#resolver-endpoint-post) for the full contract. Resolves a free-form
utility name (optionally scoped by state or email/web domain) to a canonical `eia_id`.

#### `GET /utilities/deprecated`

List utilities that have been retired, merged, or renamed, plus the ACTIVE utilities that
replaced them. Backed by the `v_deprecated_utilities` SQL view. Use this to reconcile a
historical utility name / EIA id back to the current canonical record — e.g. ingesting a
2018 EIA-861 filing that still references "Gulf Power" when the entity has since been merged
into Florida Power & Light.

**Query params**

| Param | Description |
|---|---|
| `status` | `active` \| `retired` \| `merged` \| `renamed` |
| `successor` | Only rows whose `successor_eia_id` matches the given id |
| `q` | Case-insensitive substring match on `name` or `utility_slug` |
| `limit` | Page size (default 100, max 500) |
| `cursor` | Opaque continuation token returned by the previous page |

**Response row shape**

```json
{
  "eia_id":             "util-gulf-power",
  "utility_slug":       "gulf-power",
  "name":               "Gulf Power",
  "status":             "merged",
  "raw_status":         "MERGED",
  "effective_from":     "2015-01-01T00:00:00Z",
  "effective_to":       "2019-01-01T00:00:00Z",
  "successor_eia_id":   "util-fpl",
  "successor_slug":     "florida-power-and-light",
  "source":             "EIA-861 + manual overrides",
  "deprecation_reason": "Acquired by NextEra; rolled into FPL",
  "notes":              "Acquired by NextEra; rolled into FPL"
}
```

```bash
curl "https://commongrid.info/api/v1/utilities/deprecated?status=merged"
```

**Cache:** `public, s-maxage=3600, stale-while-revalidate=86400` (the underlying view changes
at most a few times per year, when EIA-861 files or a manual override is recorded).

---

### Territories

Territories expose GeoJSON-friendly endpoints for the map.

#### `GET /territories`

List territories with metadata (no geometry). Filter by `state`, `type`, `utilityId`, or full-text
`search`.

```bash
curl "https://commongrid.info/api/v1/territories?state=VT&type=service_territory"
```

#### `GET /territories/{slug}`

Territory metadata for a single territory.

#### `GET /territories/{slug}/geometry`

GeoJSON geometry for a territory. Accepts either `regions.slug` (the documented
public identifier, e.g. `st-green-mountain-power-corp-7601`) or `territories.id`
(the legacy internal row id, e.g. `territory-7601`). Optional `?simplify=0.01`
applies `ST_SimplifyPreserveTopology` at the requested tolerance.

```bash
curl "https://commongrid.info/api/v1/territories/st-green-mountain-power-corp-7601/geometry?simplify=0.005"
```

Response:

```json
{ "data": { "type": "MultiPolygon", "coordinates": [ … ] } }
```

> **Shape difference vs. `/utilities/{slug}/geometry`:** this endpoint returns the
> legacy `{ data: <geometry> }` envelope. The newer utility-geometry endpoint
> returns a flat `FeatureCollection` with a top-level `metadata` block. If you're
> building new integrations, prefer `/utilities/{slug}/geometry` — it resolves the
> utilities → regions → territories chain server-side and the FC shape drops
> directly into Mapbox sources. Convergence is tracked as a future non-breaking
> change via `Accept: application/geo+json` content negotiation.

**Cache:** `public, s-maxage=86400, stale-while-revalidate=86400`, `Cache-Tag: territory:<slug>`
(so we can surgically purge a single territory after a contribution merges).

#### `GET /territories/lookup?lat=…&lng=…`

Point-in-polygon over all territories. Returns every region whose territory covers the point,
ordered by region type.

```bash
curl "https://commongrid.info/api/v1/territories/lookup?lat=40.7128&lng=-74.0060"
```

```json
{
  "data": [
    { "id": "region-st-1036", "slug": "new-york", "name": "New York", "type": "state" },
    { "id": "region-…", "slug": "consolidated-edison-co-ny", "name": "Consolidated Edison Co-NY", "type": "service_territory" }
  ]
}
```

**Cache:** `public, s-maxage=3600, stale-while-revalidate=3600`.

---

### ISOs, RTOs, and Balancing Authorities

Each has a symmetric surface:

| List | Detail | Geometry |
|---|---|---|
| `GET /isos` | `GET /isos/{slug}` | `GET /isos/{slug}/geometry` |
| `GET /rtos` | `GET /rtos/{slug}` | `GET /rtos/{slug}/geometry` |
| `GET /balancing-authorities` | `GET /balancing-authorities/{slug}` | `GET /balancing-authorities/{slug}/geometry` |

Geometry responses return GeoJSON identical in shape to territory geometry. Lists support the
standard `limit`, `cursor`, `sort`, `order`, `fields`, and `search` params.

---

### Regions

| Path | Description |
|---|---|
| `GET /regions` | List regions (`type`, `state`, `search`, `eiaId` filters). |
| `GET /regions/{slug}` | Single region metadata. |

Regions are the canonical "named geography" primitive — states, counties, service territories, ISO
footprints, CCAs, ZIPs, and NERC regions all live here.

---

### Power plants

| Path | Description |
|---|---|
| `GET /power-plants` | List power plants. |
| `GET /power-plants/{slug}` | Single plant. |
| `GET /power-plants/{slug}/substations` | Nearby substation relationships for the plant. |

**`GET /power-plants` query params**

| Param | Values |
|---|---|
| `state` | USPS code |
| `fuelCategory` | `solar`, `wind`, `natural_gas`, `coal`, `nuclear`, `hydro`, `battery`, `biomass`, `oil`, `geothermal`, `other` |
| `status` | `operable`, `proposed` |
| `utilityId` | `utilities.id` |
| `baId` | `balancing_authorities.id` |
| `search` | ≥2 chars, FTS on name + utility_name |
| `sort` | `name`, `totalCapacityMw`, `state` (default `name`) |
| `order` | `asc`, `desc` |
| `limit`, `cursor`, `fields` | standard |

```bash
# 50 biggest operable solar plants
curl "https://commongrid.info/api/v1/power-plants?fuelCategory=solar&status=operable&sort=totalCapacityMw&order=desc&limit=50"
```

---

### Transmission lines

| Path | Description |
|---|---|
| `GET /transmission-lines` | List transmission-line metadata (no line geometry — see [tiles](#vector-tiles)). |
| `GET /transmission-lines/{id}` | Single line by `id`. |

Query params: `voltageClass`, `owner`, `status`, `search`, `sort` (`owner`, `voltageClass`,
`lengthMiles`), `order`, `limit`, `cursor`, `fields`.

**Cache:** `public, s-maxage=60, stale-while-revalidate=300`, `Cache-Tag: transmission-lines`.

---

### Substations

| Path | Description |
|---|---|
| `GET /substations` | List substations. |
| `GET /substations/{slug}` | Single substation. |
| `GET /substations/{slug}/transmission-lines` | All transmission lines terminating at the substation (includes `role` and `match_confidence`). |

Query params on `/substations`: `state`, `substationType`, `status`, `source`, `ownerUtilityId`,
`minMaxVoltageKv`, `search` (≥2 chars), `sort` (`name`, `state`, `maxVoltageKv`), `order`, `limit`,
`cursor`, `fields`.

Substations merged from OpenStreetMap include ODbL attribution: rows with `source IN ('osm', 'hybrid')`
are © OpenStreetMap contributors. Keep attribution visible on any map or report.

**Cache:** `public, s-maxage=60, stale-while-revalidate=300`, `Cache-Tag: substations`.

---

### EV charging stations

| Path | Description |
|---|---|
| `GET /ev-stations` | List EV stations. |
| `GET /ev-stations/{slug}` | Single station. |

Query params: `state`, `city`, `network`, `accessCode`, `statusCode`, `search` (≥2 chars), `sort`
(`stationName`, `city`, `state`), `order`, `limit`, `cursor`, `fields`.

**Caveat:** AFDC does not publish county metadata. For "all chargers in Monroe County, NY"–style
questions, either pass `city` + `state`, or use a point-in-polygon against `/territories/lookup`.

---

### Pricing nodes

| Path | Description |
|---|---|
| `GET /pricing-nodes` | List pricing nodes across all 7 US ISOs/RTOs. |
| `GET /pricing-nodes/{slug}` | Single node. |
| `GET /pricing-nodes/{slug}/versions` | Historical versions of this node. |

Query params: `iso` (`CAISO`, `PJM`, `ERCOT`, `MISO`, `NYISO`, `ISO-NE`, `SPP`), `nodeType` (`hub`,
`zone`, `generator`, `load`, `interface`, `aggregate`), `state`, `search`.

**Cache:** `public, s-maxage=60, stale-while-revalidate=300`, `Cache-Tag: pricing-nodes`.

---

### Programs

| Path | Description |
|---|---|
| `GET /programs` | List demand-response, VPP, DER-aggregation, BYOD/BYOT, and managed-charging programs. |
| `GET /programs/{slug}` | Single program. |
| `GET /programs/{slug}/versions` | Historical versions. |

Heavy JSONB fields (`compensation_tiers`, `variants`) mean programs are chunkier than other entities —
use `fields=` to trim when you only need name + status + organizations.

---

### Search & changelog

| Path | Description |
|---|---|
| `GET /search?q=…` | Cross-entity full-text search across utilities, power plants, substations, EV stations, pricing nodes, and programs. |
| `GET /changelog` | Recent platform-wide changelog (rollups from `entity_versions`). |

Search returns a heterogeneous `data[]` with a `type` discriminator per row (`"utility"`, `"power_plant"`, etc.).

---

### Vector tiles

High-volume geographic features are served as **vector tiles** rather than JSON blobs. These paths
live at `/api/tiles/...` (not under `/api/v1`) because the tile ABI is fixed by MVT conventions:

```
/api/tiles/territories/{z}/{x}/{y}
/api/tiles/power-plants/{z}/{x}/{y}
/api/tiles/substations/{z}/{x}/{y}
/api/tiles/transmission-lines/{z}/{x}/{y}
/api/tiles/pricing-nodes/{z}/{x}/{y}
/api/tiles/ev-charging/{z}/{x}/{y}
```

Each endpoint returns `application/x-protobuf` MVT tiles with long TTLs. Point your Mapbox GL / MapLibre
client directly at these URLs. They're anonymous-callable and backed by the same auth/rate-limit
stack as the JSON API (authenticate with an API key to pick up the higher tier).

---

## Resolver endpoint (POST)

`POST /utilities/resolve` maps a free-form utility name (optionally scoped by state or email/web
domain) to a canonical EIA utility ID. It's the first endpoint we ship that does real fuzzy work.

### Request

```http
POST /api/v1/utilities/resolve HTTP/1.1
Content-Type: application/json
```

```json
{
  "name": "Duke Energy Carolinas",
  "state": "NC",
  "domain": "duke-energy.com",
  "confidence_threshold": 0.85
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | ≤ 200 chars. Can contain an `@domain` tail, in which case `domain` is inferred. |
| `state` | string | | Two-letter USPS code (uppercase). |
| `domain` | string | | Email/web domain, e.g. `duke-energy.com`. Combined with `name` when `name` doesn't already contain `@`. |
| `confidence_threshold` | number | | `0..1`, default `0.85`. Below this, `eia_id` comes back `null`. |

### Response

```json
{
  "eia_id": "3046",
  "confidence": 0.97,
  "match_source": "exact",
  "canonical_name": "Duke Energy Carolinas, LLC",
  "candidates": [
    { "eia_id": "3046", "name": "Duke Energy Carolinas, LLC", "score": 0.97, "segment": "investor_owned", "state": "NC" },
    { "eia_id": "4939", "name": "Duke Energy Progress, LLC", "score": 0.81, "segment": "investor_owned", "state": "NC" }
  ],
  "resolver_version": "1.0.0"
}
```

| Field | Notes |
|---|---|
| `eia_id` | Resolved EIA Utility ID, or `null` if no candidate exceeds `confidence_threshold`. |
| `confidence` | `0..1` — the top candidate's score. |
| `match_source` | `exact`, `fuzzy`, `alias`, `domain`, `override`, `none`. |
| `canonical_name` | Top candidate's canonical CommonGrid name. |
| `candidates[]` | Up to a handful of near-matches with their scores, segments, and states. Use these when you want to present disambiguation UI. |
| `resolver_version` | Version tag for the SQL-side resolver. Bumps on algorithm changes; clients can pin behavior by checking this. |

### Why POST?

Resolution is conceptually a read, but the input is a free-form body (names can contain commas,
ampersands, Unicode, and domains that look like subdomains when URL-encoded). POST keeps the input
off the URL and preserves cache cleanliness. The endpoint is `Cache-Control: no-store`.

### Tips

- **Tighten the threshold for automation.** Default `0.85` is friendly to humans scanning a disambiguation
  menu. For automated back-fill, use `0.9`+ and write a manual-review queue for anything below.
- **Prefer domain matching when you have it.** The domain path hits `utilities.domains` directly — it's
  nearly always exact. If the upstream gave you an email address, peel off the domain and pass it in
  explicitly.
- **Inspect `candidates[]`.** Even when `eia_id` is null, the array often contains the right answer —
  show it to the user for confirmation.
- **Match source semantics:**
  - `exact` — verbatim (normalized) match on `name` or `eia_name`.
  - `alias` — matched a known alias (e.g. "PG&E" → `pacific-gas-and-electric-company`).
  - `fuzzy` — trigram similarity above threshold.
  - `domain` — matched via `utilities.domains`.
  - `override` — curator-pinned mapping (for contested or merged entities).
  - `none` — nothing cleared the threshold.

### Rate limiting

POST requests hit the `write` tier (100 req/min) automatically — resolution is CPU-bound enough on
the server side that we don't want clients hammering it.

---

## Bulk batching patterns

Bulk consumers should batch requests rather than loop over single-entity calls.

### Pattern 1: bulk IDs on a list route

The utilities route accepts up to **500** EIA IDs per call:

```bash
curl -H "Authorization: Bearer $CG_KEY" \
  "https://commongrid.info/api/v1/utilities?eiaIds=$(paste -sd, ids.txt)&limit=200&fields=id,eiaId,slug,name"
```

Pair with `limit=200` and cursor pagination for >200 matches. Use `fields=` to keep responses tight.

### Pattern 2: pagination at 200/page

All list routes cap at `limit=200`. If you want the whole table, use:

```bash
cursor=""
while : ; do
  res=$(curl -sH "Authorization: Bearer $CG_KEY" \
    "https://commongrid.info/api/v1/power-plants?status=operable&limit=200&cursor=$cursor")
  echo "$res" | jq '.data[] | …'
  cursor=$(echo "$res" | jq -r '.pagination.cursor // empty')
  [ -z "$cursor" ] && break
done
```

On the `bulk` tier (50,000 req/hr) this comfortably scans even the largest table (EV stations, 85k rows)
in a minute or two.

### Pattern 3: resolve-and-fetch

```bash
eia_id=$(curl -s -X POST "https://commongrid.info/api/v1/utilities/resolve" \
  -H "Content-Type: application/json" \
  -d '{"name":"Duke Energy Carolinas","state":"NC"}' | jq -r '.eia_id')

curl "https://commongrid.info/api/v1/utilities/by-eia-id/$eia_id?include=iso,ba"
```

### Pattern 4: be a good citizen

- **Cache on your side** for anything you fetch more than once in 5 minutes — the data doesn't move
  that fast.
- **Respect `Retry-After`.** On 429, back off for the number of seconds the header says.
- **Use sparse fieldsets.** Every byte you don't transfer saves someone money.
- **Parallelize within limits.** The `registered` burst limit is 100 req/min; keep concurrent inflight
  below your tier's ceiling or you'll start eating 429s.

---

## Versioning policy

- **`v1` is stable.** Breaking changes (removing a field, changing a type, renaming a param, changing
  authentication) will not ship under `/api/v1`. If we need to break, we'll publish `/api/v2` in parallel.
- **Additive changes are fair game.** New fields on responses, new optional query params, new endpoints,
  new `match_source` values, new enum values — all additive, all possible at any time. Consumers must
  tolerate unknown fields.
- **Deprecations get a window.** When we plan to retire a field, we ship it with a `Warning` header on
  affected responses for at least 90 days before removal. Watch the repo's [`CHANGELOG`](../CHANGELOG.md)
  and the `/api/v1/changelog` endpoint.
- **OpenAPI is the contract.** [`public/openapi.json`](../public/openapi.json) is generated from the
  schema and route handlers; CI fails if code and spec diverge. Treat it as the authoritative
  machine-readable definition — if this doc disagrees, the OpenAPI spec wins.

---

## Deprecations & change log

See [`CHANGELOG.md`](../CHANGELOG.md) for the full history. Significant recent changes visible through the API:

- **`utilities.domains`** — added array of utility web/email domains, populated from NRECA and
  website-derived sources. Enables `POST /utilities/resolve` domain-match path.
- **`GET /utilities/by-eia-id/{eiaId}`** — added as a sibling to the slug route for consumers that
  already store canonical EIA IDs.
- **Bulk + numeric + presence filters on `GET /utilities`** — `eiaIds` (up to 500/request),
  `minCustomers` / `maxCustomers`, `minAmiMeters`, `minTotalMeters`, `hasLogo`, `hasWebsite`,
  `hasTerritory`.
- **`substations`** — ninth CommonGrid entity type, merged from EIA + OpenStreetMap (ODbL).
- **`transmission_line_endpoints`** — FK-quality substation graph replacing fuzzy `sub1` / `sub2`
  string matching. Access it via `GET /substations/{slug}/transmission-lines`.

---

## Getting help

- **Repo:** [`TextureHQ/commongrid`](https://github.com/TextureHQ/commongrid) — file issues, open PRs,
  or start a discussion.
- **OpenAPI spec:** [`public/openapi.json`](../public/openapi.json).
- **Schema reference:** [`DB-SCHEMA.md`](../DB-SCHEMA.md).
- **Site:** [commongrid.info](https://commongrid.info).

If you're building something neat on top of CommonGrid, we'd love to see it. Open a PR adding your
project to the README's "Built on CommonGrid" list.
