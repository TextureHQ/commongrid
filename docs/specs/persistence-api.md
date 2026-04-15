# CommonGrid Persistence Layer, API & Versioning — Technical Specification

| Field | Value |
|---|---|
| **Status** | Final (Post-Review) |
| **Author** | Meridian (Staff Engineer, CommonGrid) |
| **Reviewers** | Victor (CTO), Talos (mono repo lead), Dr. Elena Vasquez (Geospatial Architect), Marcus Chen (Principal Backend Engineer), Sarah Park (Senior Frontend Engineer) |
| **Created** | 2026-04-14 |
| **Last Updated** | 2026-04-14 |
| **Repo** | `TextureHQ/commongrid` |
| **PRD** | Notion — "CommonGrid Persistence & API" |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Choices](#2-technology-choices)
3. [Database Schema Design](#3-database-schema-design)
4. [API Design](#4-api-design)
5. [Migration Strategy](#5-migration-strategy)
6. [Explorer Migration Plan](#6-explorer-migration-plan)
7. [Sync Pipeline Updates](#7-sync-pipeline-updates)
8. [What We Decided NOT To Do (and Why)](#8-what-we-decided-not-to-do-and-why)
9. [Implementation Phases](#9-implementation-phases)
10. [Performance Considerations](#10-performance-considerations)
11. [Observability](#11-observability)
12. [Security](#12-security)
13. [Expert Panel Review Summary](#13-expert-panel-review-summary)
14. [Appendix: Entity Record Counts](#14-appendix-entity-record-counts)

---

## 1. Executive Summary

CommonGrid currently stores all data as static JSON files committed to the repository (152 MB across 11 dataset files plus ~3,000 GeoJSON territory files). This architecture has reached its limits:

- **EV charging (40 MB) and transmission lines (20 MB) exceed Vercel's 19 MB ISR page size limit**, forcing client-side fetches of tens of megabytes.
- **76 MB of JSON** is either bundled at build time or deferred to the browser.
- **Search runs client-side** via Fuse.js against the entire in-memory dataset.
- **No write API** — data updates require committing JSON files to the repo.
- **No version history** — every sync overwrites the previous data wholesale.
- **No programmatic access** — the Texture platform cannot query CommonGrid data.

This spec replaces the static JSON architecture with:

1. **PostgreSQL 16 + PostGIS 3.4** on Neon (serverless) as the persistence layer.
2. **REST API** (Next.js API routes, versioned as `/api/v1/...`) for reads and authenticated writes.
3. **Delta-based version history** — version 1 stores a full JSONB snapshot; subsequent versions store only the changed fields as deltas. Data is never overwritten.
4. **Provenance tracking** — source, submittedBy, reviewedAt, reviewedBy on every entity.
5. **Server-side search** via `pg_trgm` + PostgreSQL full-text search, replacing client-side Fuse.js.
6. **Spatial queries** via PostGIS — point-in-polygon lookups (using GEOGRAPHY type for accuracy), nearest-neighbor, bounding box filters.
7. **On-demand cache revalidation** via cache tags — sync scripts trigger `revalidateTag()` after completing, ensuring users always see fresh data without arbitrary TTLs.
8. **Feature flags per entity type** — enabling gradual rollout with instant rollback to JSON fallback.

The migration is phased over ~8 weeks, ordered by **frontend complexity** (low-risk standalone pages first, high-risk Explorer refactor last). The existing explorer migrates incrementally, entity by entity, behind feature flags.

**Total records:** ~163,000 across all entity types — well within PostgreSQL's comfort zone.

---

## 2. Technology Choices

### 2.1 Database: PostgreSQL 16 + PostGIS 3.4

**Why PostgreSQL:**

- **Native geospatial support via PostGIS.** Territory containment ("which utility serves this lat/lng?"), nearest-neighbor queries, bounding box intersection — all core CommonGrid operations — are first-class PostGIS operations. This replaces the current approach of loading all territory GeoJSON files client-side.
- **JSONB columns** for flexible metadata fields (program variants, compensation tiers, connector types) without migration overhead for every schema evolution.
- **`pg_trgm` + full-text search** for server-side fuzzy + ranked search, directly replacing client-side Fuse.js. A GIN index on `tsvector` columns gives sub-10ms search across 163K records.
- **Delta-based versioning** using an `entity_versions` table — full snapshot at creation, deltas for subsequent changes. ~75x storage reduction vs. full snapshots.
- **Relational model is a natural fit.** The data is inherently relational: utilities belong to ISOs, BAs, and RTOs; power plants belong to utilities and BAs; territories map to regions. Foreign keys enforce integrity.

**Why PostGIS specifically:**

- Territory boundary queries: `ST_Covers(territory.geography, point::geography)` — uses GEOGRAPHY type for accurate spherical calculations
- Nearest-neighbor: `ORDER BY geography <-> $point::geography LIMIT 10` — SPGIST index for fast NN queries
- Bounding box for map viewport: `WHERE geometry && ST_MakeEnvelope(west, south, east, north, 4326)` — uses derived GEOMETRY for planar operations
- GeoJSON export for tile regeneration: `ST_AsGeoJSON(geometry)` — streaming batch export, not load-all-into-memory

### 2.2 Hosting: Neon Postgres (Serverless)

| Factor | Neon | Self-managed RDS | Supabase |
|---|---|---|---|
| Scales to zero | ✅ | ❌ | ❌ |
| PostGIS support | ✅ | ✅ | ✅ |
| Branching (safe migrations) | ✅ | ❌ | ❌ |
| Texture prior art | ✅ (Dequeue API) | ❌ | ❌ |
| Serverless driver | ✅ (`@neondatabase/serverless`) | ❌ | Via client lib |
| Cost at CommonGrid scale | ~$19/mo (Pro) | ~$50+/mo | ~$25/mo |
| Auth/Realtime bundled | ❌ | ❌ | ✅ (unnecessary) |

Neon's serverless model is ideal for CommonGrid's traffic pattern: spiky reads during sync windows and explorer usage, near-zero traffic overnight. The serverless driver works natively with Vercel Edge and Serverless Functions.

**Neon cold start mitigation:** Neon scales to zero after 5 minutes of inactivity. Cold starts add 1–3 seconds. We mitigate with a keep-alive cron:

```typescript
// app/api/cron/keep-alive/route.ts
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export async function GET() {
  await db.execute(sql`SELECT 1`);
  return new Response("OK");
}
```

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/keep-alive",
      "schedule": "*/4 8-22 * * 1-5"
    }
  ]
}
```

This runs every 4 minutes during business hours (Mon–Fri 8am–10pm UTC), keeping the database warm when users are most likely active. Off-hours cold starts are acceptable.

**Neon branch workflow:** Create a branch for each migration. Run the migration against the branch, validate, then apply to main:

```bash
# 1. Create branch from main
neonctl branches create --parent main --name migration-add-territories

# 2. Apply migration to branch
DATABASE_URL=<branch-url> drizzle-kit push

# 3. Run tests against branch
DATABASE_URL=<branch-url> npm test

# 4. If tests pass, apply to main
DATABASE_URL=<main-url> drizzle-kit push

# 5. Delete branch
neonctl branches delete migration-add-territories
```

### 2.3 ORM: Drizzle ORM

| Factor | Drizzle | Prisma | Kysely |
|---|---|---|---|
| TypeScript-native schema | ✅ | ❌ (SDL) | ✅ |
| Migration tooling | ✅ (`drizzle-kit`) | ✅ | ❌ (DIY) |
| Raw SQL escape hatch | ✅ (`sql` template) | Limited | ✅ |
| PostGIS support | Via `sql` tag | Poor | Via raw SQL |
| Performance (read-heavy) | Excellent | Good (query engine overhead) | Excellent |
| Bundle size | Tiny | Large (engine binary) | Tiny |
| Serverless-friendly | ✅ | Requires engine | ✅ |

Drizzle's schema-as-code approach mirrors our existing TypeScript interfaces. The `sql` template tag provides a clean escape hatch for PostGIS queries without dropping out of the type system entirely. `drizzle-kit` handles migrations with a `push` or `generate` workflow.

**PostGIS pattern with Drizzle:**

```typescript
import { sql } from "drizzle-orm";

// Spatial query using sql tag — note GEOGRAPHY type + bbox pre-filter
const result = await db.execute(sql`
  SELECT u.* FROM utilities u
  JOIN territories t ON t.region_id = u.service_territory_id
  WHERE t.bbox && ST_MakePoint(${lng}, ${lat})
    AND ST_Covers(t.geography, ST_Point(${lng}, ${lat})::geography)
  ORDER BY
    CASE u.segment
      WHEN 'COMMUNITY_CHOICE_AGGREGATOR' THEN 1
      WHEN 'INVESTOR_OWNED_UTILITY' THEN 2
      WHEN 'MUNICIPAL_UTILITY' THEN 2
      WHEN 'DISTRIBUTION_COOPERATIVE' THEN 2
      WHEN 'GENERATION_AND_TRANSMISSION' THEN 3
      ELSE 4
    END ASC
  LIMIT 5
`);
```

### 2.4 API: REST via Next.js API Routes

The existing Next.js app already serves tile data through API routes (`/api/tiles/...`). Adding REST endpoints under `/api/v1/...` is a natural extension, not a new deployment unit.

**Why REST over GraphQL:**

- CommonGrid's access patterns are predictable and read-heavy. Clients know exactly what entities they need.
- REST maps cleanly to our resource model (utilities, ISOs, power plants, etc.).
- Caching is simpler — HTTP `Cache-Control` headers work out of the box with CDNs and Vercel's Edge Cache.
- Fewer moving parts. No schema stitching, no resolver complexity, no N+1 query footguns.
- Internal consumers (Texture platform) benefit from simple, curl-able endpoints.

**Versioning:** All endpoints are prefixed with `/api/v1/`. When breaking changes are needed (Phase 3+), we introduce `/api/v2/` while maintaining `/api/v1/` with a deprecation timeline.

**Pagination:** Cursor-based using an HMAC-signed opaque cursor token. Cursor-based pagination is stable under concurrent writes (unlike offset-based) and efficient with indexed columns. Cursors are signed to prevent tampering (see Section 4.2).

**Sparse field projection:** All list endpoints support `?fields=slug,name,segment` to return only specified fields. Critical for map-only queries where we need slug/name but not full entity data.

**Edge API Routes:** Latency-sensitive endpoints (search, spatial lookup) use Vercel Edge Runtime for global distribution:

```typescript
// app/api/v1/search/route.ts
export const runtime = "edge";
```

### 2.5 Authentication

| Phase | Mechanism | Who | Purpose |
|---|---|---|---|
| Phase 1 | API Keys (Bearer tokens) | Internal Texture services | Write API + read API for platform integration |
| Phase 1 | No auth | CommonGrid explorer | Public reads (own frontend) |
| Phase 2 | OAuth 2.0 via Auth0 | External developers | Public API access |

**Phase 1 API Key design:**

- Keys are UUIDv4 tokens prefixed with `cg_` for easy identification (e.g., `cg_a1b2c3d4-e5f6-...`).
- Keys are stored **hashed** (SHA-256) in the `api_keys` table. The plaintext is shown once at creation and never stored.
- Each key has: `name`, `scopes` (resource:action format, e.g., `utilities:read`, `utilities:write`, `admin:api-keys`), `created_by`, `expires_at`, `last_used_at`.
- Auth middleware checks `Authorization: Bearer cg_...` header, hashes the token, looks up the key, and validates scopes.

**Provider-agnostic auth middleware** — designed to support both API keys now and OAuth later:

```typescript
// lib/api/auth.ts
interface AuthContext {
  type: "api-key" | "oauth";
  identity: string;       // key name or OAuth sub
  scopes: string[];
  metadata: Record<string, unknown>;
}

export async function authenticate(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer cg_")) {
    return authenticateApiKey(authHeader);
  } else if (authHeader?.startsWith("Bearer ey")) {
    // Future: JWT (OAuth)
    return authenticateOAuth(authHeader);
  }

  return null; // Unauthenticated — OK for public reads
}

function hasScope(auth: AuthContext, resource: string, action: string): boolean {
  const required = `${resource}:${action}`;
  return auth.scopes.some(
    (s) =>
      s === required ||
      s === `${resource}:*` ||
      s === `*:${action}` ||
      s === "*:*"
  );
}
```

**Why not OAuth from day one:** We have exactly one internal consumer in Phase 1 (Texture platform). A full OAuth flow is overkill. API keys are simpler to issue, rotate, and revoke. OAuth comes in Phase 3 when external developers need access.

---

## 3. Database Schema Design

### 3.1 Design Principles

1. **Preserve existing TypeScript interfaces.** Column names are `snake_case` equivalents of the existing `camelCase` fields. No data model changes — this is a persistence migration, not a data redesign.
2. **Provenance on every entity.** `source`, `source_url`, `submitted_by`, `reviewed_at`, `reviewed_by` columns track where data came from and who touched it.
3. **Delta-based version history.** Version 1 stores a full JSONB snapshot. Subsequent versions store only the delta (`{ field: { old, new } }`). Reconstruct any version by applying deltas to the base snapshot.
4. **GEOGRAPHY as source of truth for spatial data.** Territory boundaries stored as `GEOGRAPHY(MultiPolygon, 4326)` for accurate spherical calculations. A derived `GEOMETRY` column is generated for tile export and planar operations. Point entities follow the same pattern.
5. **JSONB for nested/variable structures.** Program variants, compensation tiers, EV connector types, and power plant technologies — all stored as JSONB arrays rather than separate junction tables. This avoids excessive joins for read-heavy workloads while preserving query capability via JSONB operators.
6. **Explicit ON DELETE constraints.** Every foreign key specifies `ON DELETE RESTRICT` (prevent accidental deletes) or `ON DELETE SET NULL` (soft references), documented in schema comments.
7. **Automatic `updated_at` trigger.** A shared trigger function keeps `updated_at` in sync on every UPDATE.

### 3.2 Shared Infrastructure

#### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

#### Automatic Timestamp Trigger

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied to every entity table:

```sql
CREATE TRIGGER set_updated_at BEFORE UPDATE ON isos
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rtos
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON balancing_authorities
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regions
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON utilities
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON power_plants
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ev_stations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON transmission_lines
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON pricing_nodes
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

#### Shared Columns (Provenance & Audit)

Every entity table includes:

```sql
-- Provenance
source          TEXT,                  -- e.g., 'EIA-861', 'AFDC', 'HIFLD', 'manual'
source_url      TEXT,                  -- URL to the original data source
submitted_by    TEXT,                  -- who created/submitted this record
reviewed_at     TIMESTAMPTZ,           -- when a human reviewed this record
reviewed_by     TEXT,                  -- who reviewed this record

-- Timestamps
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- Version (for optimistic locking)
version         INTEGER NOT NULL DEFAULT 1
```

### 3.3 Core Entity Tables

#### `isos`

```sql
CREATE TABLE isos (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  short_name      TEXT NOT NULL,
  logo            TEXT,
  website         TEXT,
  states          TEXT[] NOT NULL DEFAULT '{}',
  region_id       TEXT REFERENCES regions(id) ON DELETE SET NULL,

  -- Provenance & audit (shared columns)
  source          TEXT,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_isos_slug ON isos(slug);
```

**Record count:** 7

#### `rtos`

```sql
CREATE TABLE rtos (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  short_name      TEXT NOT NULL,
  logo            TEXT,
  website         TEXT,
  states          TEXT[] NOT NULL DEFAULT '{}',
  region_id       TEXT REFERENCES regions(id) ON DELETE SET NULL,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_rtos_slug ON rtos(slug);
```

**Record count:** 7

#### `balancing_authorities`

```sql
CREATE TABLE balancing_authorities (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  short_name      TEXT NOT NULL,
  logo            TEXT,
  eia_code        TEXT,
  eia_id          TEXT,
  website         TEXT,
  states          TEXT[] NOT NULL DEFAULT '{}',
  iso_id          TEXT REFERENCES isos(id) ON DELETE SET NULL,
  region_id       TEXT REFERENCES regions(id) ON DELETE SET NULL,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_bas_slug ON balancing_authorities(slug);
CREATE INDEX idx_bas_eia_code ON balancing_authorities(eia_code);
CREATE INDEX idx_bas_eia_id ON balancing_authorities(eia_id);
CREATE INDEX idx_bas_iso_id ON balancing_authorities(iso_id);

COMMENT ON COLUMN balancing_authorities.iso_id IS 'FK to isos; ON DELETE SET NULL (ISOs may be reorganized)';
```

**Record count:** 45

#### `regions`

```sql
CREATE TABLE regions (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,  -- RegionType enum value
  eia_id          TEXT,
  state           TEXT,
  customers       INTEGER,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  source_date     TEXT,           -- preserving existing field
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_regions_slug ON regions(slug);
CREATE INDEX idx_regions_eia_id ON regions(eia_id);
CREATE INDEX idx_regions_type ON regions(type);
CREATE INDEX idx_regions_state ON regions(state);
```

**Record count:** 3,000

#### `utilities`

```sql
CREATE TABLE utilities (
  id                        TEXT PRIMARY KEY,
  slug                      TEXT NOT NULL UNIQUE,
  name                      TEXT NOT NULL,
  eia_name                  TEXT,
  short_name                TEXT,
  logo                      TEXT,
  website                   TEXT,
  eia_id                    TEXT,
  segment                   TEXT NOT NULL,  -- UtilitySegment enum
  status                    TEXT NOT NULL,  -- UtilityStatus enum
  customer_count            INTEGER,
  peak_demand_mw            DOUBLE PRECISION,
  winter_peak_demand_mw     DOUBLE PRECISION,
  total_revenue_dollars     DOUBLE PRECISION,
  total_sales_mwh           DOUBLE PRECISION,
  ba_code                   TEXT,
  nerc_region               TEXT,
  has_generation            BOOLEAN,
  has_transmission           BOOLEAN,
  has_distribution           BOOLEAN,
  ami_meter_count           INTEGER,
  total_meter_count         INTEGER,
  jurisdiction              TEXT,
  iso_id                    TEXT REFERENCES isos(id) ON DELETE RESTRICT,
  rto_id                    TEXT REFERENCES rtos(id) ON DELETE RESTRICT,
  balancing_authority_id    TEXT REFERENCES balancing_authorities(id) ON DELETE SET NULL,
  generation_provider_id    TEXT REFERENCES utilities(id) ON DELETE SET NULL,
  transmission_provider_id  TEXT REFERENCES utilities(id) ON DELETE SET NULL,
  parent_id                 TEXT REFERENCES utilities(id) ON DELETE SET NULL,
  successor_id              TEXT REFERENCES utilities(id) ON DELETE SET NULL,
  service_territory_id      TEXT REFERENCES regions(id) ON DELETE SET NULL,
  notion_page_id            TEXT,

  -- Full-text search vector
  search_vector             TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(eia_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(short_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(jurisdiction, '')), 'C')
  ) STORED,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

COMMENT ON COLUMN utilities.iso_id IS 'FK to isos; ON DELETE RESTRICT (cannot delete ISO while utilities reference it)';
COMMENT ON COLUMN utilities.rto_id IS 'FK to rtos; ON DELETE RESTRICT (cannot delete RTO while utilities reference it)';
COMMENT ON COLUMN utilities.balancing_authority_id IS 'FK to balancing_authorities; ON DELETE SET NULL';
COMMENT ON COLUMN utilities.parent_id IS 'FK to utilities (self-ref); ON DELETE SET NULL';

-- Primary query indexes
CREATE INDEX idx_utilities_slug ON utilities(slug);
CREATE INDEX idx_utilities_eia_id ON utilities(eia_id);
CREATE INDEX idx_utilities_segment ON utilities(segment);
CREATE INDEX idx_utilities_status ON utilities(status);
CREATE INDEX idx_utilities_iso_id ON utilities(iso_id);
CREATE INDEX idx_utilities_rto_id ON utilities(rto_id);
CREATE INDEX idx_utilities_ba_id ON utilities(balancing_authority_id);
CREATE INDEX idx_utilities_jurisdiction ON utilities(jurisdiction);
CREATE INDEX idx_utilities_parent_id ON utilities(parent_id);
CREATE INDEX idx_utilities_service_territory ON utilities(service_territory_id);

-- Full-text search index
CREATE INDEX idx_utilities_search ON utilities USING GIN(search_vector);

-- Trigram index for fuzzy search (LIKE '%query%')
CREATE INDEX idx_utilities_name_trgm ON utilities USING GIN(name gin_trgm_ops);
```

**Record count:** 3,133

### 3.4 Extended Entity Tables

#### `power_plants`

```sql
CREATE TABLE power_plants (
  id                        TEXT PRIMARY KEY,
  slug                      TEXT NOT NULL UNIQUE,
  name                      TEXT NOT NULL,
  plant_code                TEXT NOT NULL,
  utility_id                TEXT REFERENCES utilities(id) ON DELETE SET NULL,
  utility_name              TEXT NOT NULL,
  balancing_authority_id    TEXT REFERENCES balancing_authorities(id) ON DELETE SET NULL,
  ba_code                   TEXT,
  state                     TEXT NOT NULL,
  county                    TEXT,
  latitude                  DOUBLE PRECISION NOT NULL,
  longitude                 DOUBLE PRECISION NOT NULL,

  -- GEOGRAPHY as source of truth for accurate distance/area calculations
  geography                 GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,

  -- Derived GEOMETRY for tile export and planar bbox queries
  geometry                  GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  ) STORED,

  nerc_region               TEXT,
  sector                    TEXT NOT NULL,
  primary_fuel              TEXT,
  fuel_category             TEXT NOT NULL,  -- FuelCategory enum
  technologies              JSONB NOT NULL DEFAULT '[]',
  energy_sources            JSONB NOT NULL DEFAULT '[]',
  total_capacity_mw         DOUBLE PRECISION NOT NULL,
  generator_count           INTEGER NOT NULL,
  operating_year            INTEGER,
  grid_voltage_kv           DOUBLE PRECISION,
  status                    TEXT NOT NULL,  -- 'operable' | 'proposed'
  proposed_capacity_mw      DOUBLE PRECISION,
  proposed_online_year      INTEGER,

  -- Full-text search vector
  search_vector             TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(utility_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(state, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(county, '')), 'C')
  ) STORED,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_pp_slug ON power_plants(slug);
CREATE INDEX idx_pp_plant_code ON power_plants(plant_code);
CREATE INDEX idx_pp_utility_id ON power_plants(utility_id);
CREATE INDEX idx_pp_ba_id ON power_plants(balancing_authority_id);
CREATE INDEX idx_pp_state ON power_plants(state);
CREATE INDEX idx_pp_fuel_category ON power_plants(fuel_category);
CREATE INDEX idx_pp_status ON power_plants(status);

-- Spatial indexes: GIST for containment/overlap, SPGIST for nearest-neighbor
CREATE INDEX idx_pp_geography ON power_plants USING GIST(geography);
CREATE INDEX idx_pp_geography_nd ON power_plants USING SPGIST(geography);
CREATE INDEX idx_pp_geometry ON power_plants USING GIST(geometry);

-- Search indexes
CREATE INDEX idx_pp_search ON power_plants USING GIN(search_vector);
CREATE INDEX idx_pp_name_trgm ON power_plants USING GIN(name gin_trgm_ops);
```

**Record count:** 15,082

#### `ev_stations`

```sql
CREATE TABLE ev_stations (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  station_name          TEXT NOT NULL,
  street_address        TEXT NOT NULL,
  city                  TEXT NOT NULL,
  state                 TEXT NOT NULL,
  zip                   TEXT NOT NULL,
  latitude              DOUBLE PRECISION NOT NULL,
  longitude             DOUBLE PRECISION NOT NULL,

  -- GEOGRAPHY as source of truth
  geography             GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,

  -- Derived GEOMETRY for tile export
  geometry              GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  ) STORED,

  ev_network            TEXT,
  ev_level1_evse_num    INTEGER NOT NULL DEFAULT 0,
  ev_level2_evse_num    INTEGER NOT NULL DEFAULT 0,
  ev_dc_fast_num        INTEGER NOT NULL DEFAULT 0,
  ev_connector_types    JSONB NOT NULL DEFAULT '[]',
  access_code           TEXT NOT NULL,  -- 'public' | 'private' | 'restricted'
  status_code           TEXT NOT NULL,  -- 'E' | 'P' | 'T'
  open_date             TEXT,
  facility_type         TEXT,
  owner_type_code       TEXT,
  ev_pricing            TEXT,

  -- Full-text search vector
  search_vector         TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(station_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(street_address, '')), 'C')
  ) STORED,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_ev_slug ON ev_stations(slug);
CREATE INDEX idx_ev_state ON ev_stations(state);
CREATE INDEX idx_ev_network ON ev_stations(ev_network);
CREATE INDEX idx_ev_access ON ev_stations(access_code);
CREATE INDEX idx_ev_status ON ev_stations(status_code);

-- Spatial indexes: GIST for containment/overlap, SPGIST for nearest-neighbor
CREATE INDEX idx_ev_geography ON ev_stations USING GIST(geography);
CREATE INDEX idx_ev_geography_nd ON ev_stations USING SPGIST(geography);
CREATE INDEX idx_ev_geometry ON ev_stations USING GIST(geometry);

-- Search indexes
CREATE INDEX idx_ev_search ON ev_stations USING GIN(search_vector);
CREATE INDEX idx_ev_name_trgm ON ev_stations USING GIN(station_name gin_trgm_ops);
```

**Record count:** 85,425

#### `transmission_lines`

```sql
CREATE TABLE transmission_lines (
  id                TEXT PRIMARY KEY,
  object_id         INTEGER NOT NULL,
  type              TEXT NOT NULL,
  status            TEXT NOT NULL,
  owner             TEXT NOT NULL,
  voltage           DOUBLE PRECISION,
  volt_class        TEXT NOT NULL,
  voltage_class     TEXT NOT NULL,  -- VoltageClass enum
  sub1              TEXT NOT NULL,
  sub2              TEXT NOT NULL,
  length_miles      DOUBLE PRECISION NOT NULL,
  naics_code        TEXT NOT NULL,

  -- Provenance & audit
  source          TEXT NOT NULL DEFAULT 'HIFLD',
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

-- Note: Transmission line geometry is stored in the territories/geometry
-- table or rendered via PMTiles. Individual line geometries are large
-- (LineString with many coordinates) and used only for tile generation,
-- not API queries. We store metadata here and generate tiles from source
-- GeoJSON via tippecanoe pipeline.

CREATE INDEX idx_tl_object_id ON transmission_lines(object_id);
CREATE INDEX idx_tl_voltage_class ON transmission_lines(voltage_class);
CREATE INDEX idx_tl_owner ON transmission_lines(owner);
CREATE INDEX idx_tl_status ON transmission_lines(status);
CREATE INDEX idx_tl_owner_trgm ON transmission_lines USING GIN(owner gin_trgm_ops);
```

**Record count:** 52,244

#### `pricing_nodes`

```sql
CREATE TABLE pricing_nodes (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  iso             TEXT NOT NULL,         -- IsoRto enum: 'CAISO', 'PJM', etc.
  node_type       TEXT NOT NULL,         -- PricingNodeType enum
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,

  -- GEOGRAPHY as source of truth
  geography       GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,

  -- Derived GEOMETRY for tile export
  geometry        GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  ) STORED,

  zone            TEXT,
  state           TEXT,
  voltage_kv      DOUBLE PRECISION,
  eia_plant_code  TEXT,

  -- Provenance & audit
  source          TEXT NOT NULL,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_pn_slug ON pricing_nodes(slug);
CREATE INDEX idx_pn_iso ON pricing_nodes(iso);
CREATE INDEX idx_pn_node_type ON pricing_nodes(node_type);
CREATE INDEX idx_pn_state ON pricing_nodes(state);

-- Spatial indexes
CREATE INDEX idx_pn_geography ON pricing_nodes USING GIST(geography);
CREATE INDEX idx_pn_geography_nd ON pricing_nodes USING SPGIST(geography);
CREATE INDEX idx_pn_geometry ON pricing_nodes USING GIST(geometry);

-- Search index
CREATE INDEX idx_pn_name_trgm ON pricing_nodes USING GIN(name gin_trgm_ops);
```

**Record count:** 4,065

#### `programs`

```sql
CREATE TABLE programs (
  id                    TEXT PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  description           TEXT,
  organizations         JSONB NOT NULL DEFAULT '[]',   -- ProgramOrganization[]
  asset_types           JSONB NOT NULL DEFAULT '[]',   -- AssetType[]
  market_segments       JSONB NOT NULL DEFAULT '[]',   -- MarketSegment[]
  participation_models  JSONB NOT NULL DEFAULT '[]',   -- ParticipationModel[]
  incentive_structures  JSONB NOT NULL DEFAULT '[]',   -- IncentiveStructure[]
  grid_services         JSONB NOT NULL DEFAULT '[]',   -- GridService[]
  regions               JSONB NOT NULL DEFAULT '[]',   -- string[] (region IDs)
  compensation_tiers    JSONB NOT NULL DEFAULT '[]',   -- CompensationTier[]
  capacity_target       DOUBLE PRECISION,
  max_enrollments       INTEGER,
  program_season        JSONB,                         -- ProgramSeason
  launched_at           TEXT,
  enrollment_opens      TEXT,
  enrollment_closes     TEXT,
  ends_at               TEXT,
  status                TEXT NOT NULL,                 -- ProgramStatus enum
  program_website       TEXT,
  faq_url               TEXT,
  terms_url             TEXT,
  contact_url           TEXT,
  variants              JSONB NOT NULL DEFAULT '[]',   -- ProgramVariant[]

  -- Full-text search vector
  search_vector         TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  submitted_by    TEXT,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_programs_slug ON programs(slug);
CREATE INDEX idx_programs_status ON programs(status);
CREATE INDEX idx_programs_search ON programs USING GIN(search_vector);
CREATE INDEX idx_programs_name_trgm ON programs USING GIN(name gin_trgm_ops);

-- GIN indexes for JSONB array queries
CREATE INDEX idx_programs_asset_types ON programs USING GIN(asset_types);
CREATE INDEX idx_programs_grid_services ON programs USING GIN(grid_services);
CREATE INDEX idx_programs_organizations ON programs USING GIN(organizations);
```

**Record count:** 607

### 3.5 Territory Geometry Table

```sql
CREATE TABLE territories (
  id              TEXT PRIMARY KEY,     -- matches region ID (e.g., 'region-st-1000')
  region_id       TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,

  -- Primary storage: GEOGRAPHY for accurate spherical calculations
  geography       GEOGRAPHY(MultiPolygon, 4326) NOT NULL,

  -- Derived GEOMETRY for tile export and planar operations
  geometry        GEOMETRY(MultiPolygon, 4326) GENERATED ALWAYS AS (
    geography::geometry
  ) STORED,

  -- Simplified geometries for fast queries at different resolutions
  simplified_1km  GEOMETRY(MultiPolygon, 4326) GENERATED ALWAYS AS (
    ST_SimplifyPreserveTopology(geography::geometry, 0.01)
  ) STORED,

  -- Centroid for labeling and quick-reference lookups
  centroid        GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    ST_Centroid(geography::geometry)
  ) STORED,

  -- Spatial properties (precomputed)
  bbox            BOX2D GENERATED ALWAYS AS (
    Box2D(geography::geometry)
  ) STORED,

  area_sq_km      DOUBLE PRECISION GENERATED ALWAYS AS (
    ST_Area(geography) / 1e6
  ) STORED,

  -- Vertex count for performance monitoring
  vertex_count    INTEGER GENERATED ALWAYS AS (
    ST_NPoints(geography::geometry)
  ) STORED,

  -- Provenance & audit
  source          TEXT,
  source_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN territories.region_id IS 'FK to regions; ON DELETE CASCADE (territory is removed when region is removed)';

-- Core spatial indexes
CREATE INDEX idx_territories_region_id ON territories(region_id);
CREATE INDEX idx_territories_geography ON territories USING GIST(geography);
CREATE INDEX idx_territories_geography_nd ON territories USING SPGIST(geography);
CREATE INDEX idx_territories_geometry ON territories USING GIST(geometry);
CREATE INDEX idx_territories_simplified_1km ON territories USING GIST(simplified_1km);

-- B-tree indexes for filtering
CREATE INDEX idx_territories_area ON territories(area_sq_km);
```

**Record count:** ~3,000 (one per region with a GeoJSON boundary file)

**Note on geometry types:** Current territory files contain both `Polygon` and `MultiPolygon` geometries. We normalize all to `MultiPolygon` during import (a single `Polygon` becomes a `MultiPolygon` with one member). This simplifies queries and avoids type mismatches.

**Note on GEOGRAPHY vs GEOMETRY:** We store `GEOGRAPHY(MultiPolygon, 4326)` as the source of truth because:
- Area calculations are accurate (spherical geometry, not Cartesian on degrees)
- Distance calculations are accurate
- Point-in-polygon is topologically correct
- The derived `GEOMETRY` column is auto-generated for tile export and bbox queries where planar math is fine

### 3.6 Version History Table (Delta-Based)

```sql
CREATE TABLE entity_versions (
  id              BIGSERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,         -- 'utility', 'iso', 'power_plant', etc.
  entity_id       TEXT NOT NULL,         -- FK to the entity's primary key
  version_number  INTEGER NOT NULL,

  -- Version 1: full snapshot. Version 2+: delta only.
  snapshot        JSONB,                 -- full data (non-null only for v1)
  delta           JSONB,                 -- { "field": { "old": X, "new": Y } } (null for v1)

  changed_by      TEXT,                  -- who made this change (API key name, sync script, etc.)
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_type     TEXT NOT NULL,         -- 'create', 'update', 'delete'
  change_summary  TEXT,                  -- human-readable summary of what changed

  UNIQUE(entity_type, entity_id, version_number),
  CHECK (
    (snapshot IS NOT NULL AND delta IS NULL) OR
    (snapshot IS NULL AND delta IS NOT NULL)
  )
);

CREATE INDEX idx_ev_entity ON entity_versions(entity_type, entity_id);
CREATE INDEX idx_ev_changed_at ON entity_versions(changed_at);
CREATE INDEX idx_ev_change_type ON entity_versions(change_type);
```

**Why delta-based instead of full snapshots:**

Full JSONB snapshots of every version would cause severe storage bloat:
- 365 syncs/year × ~16,300 records changing per sync × ~500 bytes avg = **2.97 GB/year**
- After 3 years: ~9 GB (Neon Pro plan includes only 10 GB)

With deltas, a typical change (e.g., `customerCount` update) is ~100 bytes instead of ~1.5 KB. **~75x storage reduction.** 3-year storage: ~396 MB instead of 9 GB.

**Version creation workflow:**

```typescript
// lib/db/versioning.ts
export async function createVersion<T extends Record<string, unknown>>(
  entityType: string,
  entityId: string,
  newData: T,
  oldData: T | null,
  changeType: "create" | "update" | "delete",
  changedBy: string,
  changeSummary?: string
) {
  const [latest] = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(version_number), 0)` })
    .from(entityVersions)
    .where(
      and(
        eq(entityVersions.entityType, entityType),
        eq(entityVersions.entityId, entityId)
      )
    );

  const nextVersion = (latest?.maxVersion ?? 0) + 1;

  if (nextVersion === 1) {
    // First version: store full snapshot
    await db.insert(entityVersions).values({
      entityType,
      entityId,
      versionNumber: 1,
      snapshot: newData,
      delta: null,
      changedBy,
      changeType,
      changeSummary,
    });
  } else {
    // Subsequent versions: store only the delta
    const delta = computeDelta(oldData!, newData);
    await db.insert(entityVersions).values({
      entityType,
      entityId,
      versionNumber: nextVersion,
      snapshot: null,
      delta,
      changedBy,
      changeType,
      changeSummary: changeSummary || generateChangeSummary(delta),
    });
  }

  return nextVersion;
}

function computeDelta(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const delta: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(newData)) {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      delta[key] = { old: oldData[key], new: newData[key] };
    }
  }
  return delta;
}

function generateChangeSummary(
  delta: Record<string, { old: unknown; new: unknown }>
): string {
  const fields = Object.keys(delta);
  if (fields.length <= 3) {
    return fields
      .map((f) => `${f}: ${JSON.stringify(delta[f].old)} → ${JSON.stringify(delta[f].new)}`)
      .join(", ");
  }
  return `Updated ${fields.length} fields: ${fields.join(", ")}`;
}
```

**Reconstructing entity at version N:**

```typescript
export async function getEntityAtVersion(
  entityType: string,
  entityId: string,
  targetVersion: number
): Promise<Record<string, unknown> | null> {
  const versions = await db
    .select()
    .from(entityVersions)
    .where(
      and(
        eq(entityVersions.entityType, entityType),
        eq(entityVersions.entityId, entityId),
        lte(entityVersions.versionNumber, targetVersion)
      )
    )
    .orderBy(asc(entityVersions.versionNumber));

  if (versions.length === 0) return null;

  // Start with base snapshot (v1)
  let entity = { ...(versions[0].snapshot as Record<string, unknown>) };

  // Apply deltas in order
  for (let i = 1; i < versions.length; i++) {
    const delta = versions[i].delta as Record<string, { old: unknown; new: unknown }>;
    if (delta) {
      for (const [key, change] of Object.entries(delta)) {
        entity[key] = change.new;
      }
    }
  }

  return entity;
}
```

**Version pruning strategy:**

| Tier | Retention | Action |
|---|---|---|
| Recent (0–12 months) | Keep all versions | No pruning |
| Historical (1–3 years) | Monthly snapshots only | Consolidate: keep latest version per month, delete intermediate deltas |
| Archive (3+ years) | Export to cold storage | Export to S3/R2, delete from Postgres |

Implemented as a monthly cron:

```sql
-- Consolidate versions older than 1 year to monthly snapshots
-- (Application-level: reconstruct full snapshot for the monthly keeper, delete the rest)
```

### 3.7 API Keys Table

```sql
CREATE TABLE api_keys (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,  -- SHA-256 hash of the API key
  key_prefix      TEXT NOT NULL,         -- first 8 chars for identification (e.g., 'cg_a1b2')
  scopes          TEXT[] NOT NULL DEFAULT '{utilities:read}',
  rotation_group  TEXT,                  -- for zero-downtime key rotation
  created_by      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_api_keys_rotation ON api_keys(rotation_group) WHERE rotation_group IS NOT NULL;
```

**Scope format:** `resource:action` (e.g., `utilities:read`, `utilities:write`, `admin:api-keys`, `*:read`, `*:*`).

### 3.8 Bulk Operations Table (Idempotency)

```sql
CREATE TABLE bulk_operations (
  idempotency_key TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'failed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  result          JSONB
);

-- Auto-clean old entries
CREATE INDEX idx_bulk_ops_created ON bulk_operations(created_at);
```

### 3.9 Entity-Relationship Diagram (Text)

```
┌─────────┐    ┌─────────┐    ┌────────────────────┐
│  isos   │◄───┤  rtos   │    │ balancing_          │
│         │    │         │    │ authorities         │
└────┬────┘    └─────────┘    └──────────┬──────────┘
     │                                    │
     │         ┌─────────────┐           │
     └────────►│  utilities  │◄──────────┘
               │             │
               └──────┬──────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼────┐  ┌────▼────┐  ┌───▼────────┐
    │ power_  │  │programs │  │ regions    │
    │ plants  │  │         │  │            │
    └─────────┘  └─────────┘  └─────┬──────┘
                                    │
                              ┌─────▼──────┐
                              │territories │
                              │(geography) │
                              └────────────┘

    ┌────────────┐  ┌──────────────────┐  ┌──────────────┐
    │ev_stations │  │transmission_lines│  │pricing_nodes │
    └────────────┘  └──────────────────┘  └──────────────┘

    ┌─────────────────┐  ┌──────────┐  ┌─────────────────┐
    │entity_versions  │  │ api_keys │  │bulk_operations  │
    │(delta-based)    │  │ (scoped) │  │(idempotency)    │
    └─────────────────┘  └──────────┘  └─────────────────┘
```

---

## 4. API Design

### 4.1 Conventions

| Convention | Detail |
|---|---|
| Base URL | `/api/v1` |
| Content-Type | `application/json` |
| Pagination | Cursor-based (`?cursor=<signed>&limit=50`) |
| Sorting | `?sort=name&order=asc` |
| Filtering | Query params matching column names |
| Search | `?search=<query>` (full-text + trigram) |
| Sparse fields | `?fields=slug,name,segment` (return only specified fields) |
| Spatial | `?lat=<float>&lng=<float>` (point-in-polygon) or `?bbox=<w,s,e,n>` |
| Auth (writes) | `Authorization: Bearer cg_<key>` |
| Auth (reads) | None required for CommonGrid explorer; API key optional |
| Rate limiting | Via Upstash Redis: 100 req/min (unauthenticated), 1000 req/min (authenticated) |
| Error format | `{ "error": { "code": "NOT_FOUND", "message": "...", "request_id": "req_..." } }` |

### 4.2 Pagination Response Envelope

All list endpoints return:

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;   // HMAC-signed opaque cursor for next page
    limit: number;           // items per page (default 50, max 200)
    total: number;           // total matching records
    hasMore: boolean;
  };
}
```

**HMAC-signed cursor implementation:**

```typescript
import { createHmac } from "crypto";

const CURSOR_SECRET = process.env.CURSOR_SECRET!;

interface CursorV1 {
  v: 1;                           // version (for future cursor format changes)
  s: Record<string, unknown>;     // sort fields { name: "Duke Energy" }
  id: string;                     // entity ID (tiebreaker)
}

export function encodeCursor(data: CursorV1): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = createHmac("sha256", CURSOR_SECRET)
    .update(payload)
    .digest("hex")
    .slice(0, 16); // truncate for brevity
  return `${payload}.${signature}`;
}

export function decodeCursor(cursor: string): CursorV1 {
  const [payload, signature] = cursor.split(".");
  const expectedSig = createHmac("sha256", CURSOR_SECRET)
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  if (signature !== expectedSig) {
    throw new ApiError("BAD_REQUEST", "Invalid cursor signature");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString());
}
```

This prevents cursor injection attacks — an attacker cannot forge a cursor to skip pagination or access arbitrary data.

### 4.3 Utilities Endpoints

#### `GET /api/v1/utilities`

List utilities with filtering, search, sorting, pagination, and sparse field projection.

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `search` | string | Full-text + fuzzy search across name, eiaName, shortName |
| `segment` | string | Filter by UtilitySegment (comma-separated for multiple) |
| `status` | string | Filter by UtilityStatus (comma-separated) |
| `state` | string | Filter by jurisdiction state (2-letter code) |
| `iso` | string | Filter by ISO slug |
| `rto` | string | Filter by RTO slug |
| `ba` | string | Filter by Balancing Authority slug |
| `hasGeneration` | boolean | Filter by generation capability |
| `hasTransmission` | boolean | Filter by transmission capability |
| `hasDistribution` | boolean | Filter by distribution capability |
| `lat` | float | Latitude for spatial query (requires `lng`) |
| `lng` | float | Longitude for spatial query (requires `lat`) |
| `fields` | string | Comma-separated fields to return (e.g., `slug,name,segment`) |
| `sort` | string | Sort field: `name`, `customerCount`, `peakDemandMw`, `totalSalesMwh` |
| `order` | string | `asc` or `desc` (default: `asc`) |
| `cursor` | string | Pagination cursor |
| `limit` | integer | Page size (1-200, default 50) |
| `include` | string | Comma-separated related data: `iso`, `rto`, `ba`, `territory` |

**Response:**

```json
{
  "data": [
    {
      "id": "2dc5b7fc-9f3d-8198-942c-cfeb9aa94d94",
      "slug": "duke-energy",
      "name": "Duke Energy",
      "eiaName": "Duke Energy Carolinas, LLC",
      "segment": "INVESTOR_OWNED_UTILITY",
      "status": "ACTIVE",
      "customerCount": 2800000,
      "jurisdiction": "NC",
      "version": 3,
      "source": "EIA-861",
      "updatedAt": "2026-03-15T00:00:00Z"
    }
  ],
  "pagination": {
    "cursor": "eyJ2IjoxLCJzIjp7Im5hbWUiOiJEdWtlIEVuZXJneSJ9LCJpZCI6IjJkYzViN2ZjLi4uIn0.a1b2c3d4e5f6g7h8",
    "limit": 50,
    "total": 3133,
    "hasMore": true
  }
}
```

**Spatial query — handling overlapping territories:**

`GET /api/v1/utilities?lat=35.7796&lng=-78.6382`

Returns utilities whose service territories contain the given point, **ranked by segment priority** (not just `LIMIT 1`):

```sql
SELECT u.id, u.slug, u.name, u.segment,
  CASE u.segment
    WHEN 'COMMUNITY_CHOICE_AGGREGATOR' THEN 1
    WHEN 'INVESTOR_OWNED_UTILITY' THEN 2
    WHEN 'MUNICIPAL_UTILITY' THEN 2
    WHEN 'DISTRIBUTION_COOPERATIVE' THEN 2
    WHEN 'GENERATION_AND_TRANSMISSION' THEN 3
    ELSE 4
  END AS priority
FROM utilities u
JOIN territories t ON t.region_id = u.service_territory_id
WHERE t.bbox && ST_MakePoint(-78.6382, 35.7796)         -- fast bbox pre-filter
  AND ST_Covers(t.geography, ST_Point(-78.6382, 35.7796)::geography)  -- precise check
ORDER BY priority ASC
LIMIT 5;
```

**Response for spatial queries:**

```json
{
  "data": {
    "primary": {
      "slug": "duke-energy",
      "name": "Duke Energy",
      "segment": "INVESTOR_OWNED_UTILITY"
    },
    "others": []
  }
}
```

This correctly handles overlapping territories (CCAs overlaying IOUs, wholesale vs. retail).

#### `GET /api/v1/utilities/:slug`

Get a single utility by slug with optional related data.

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `include` | string | Comma-separated: `iso`, `rto`, `ba`, `territory`, `children`, `powerPlants`, `programs` |

#### `GET /api/v1/utilities/:slug/versions`

Get version history for a utility. Returns version metadata (change summaries) without full data.

#### `GET /api/v1/utilities/:slug/versions/:version`

Get the full entity state at a specific version. Reconstructed by applying deltas to the base snapshot.

#### `POST /api/v1/utilities` *(Auth required: `utilities:write` scope)*

Create a new utility. Requires optimistic locking: the response includes `version: 1`.

#### `PATCH /api/v1/utilities/:slug` *(Auth required: `utilities:write` scope)*

Update an existing utility. Requires version check for optimistic locking:

```typescript
// Request must include expected version
const result = await db
  .update(utilities)
  .set({ customerCount: newValue, version: sql`version + 1` })
  .where(and(eq(utilities.slug, slug), eq(utilities.version, expectedVersion)));

if (result.rowCount === 0) {
  throw new ApiError(
    "CONFLICT",
    "Version conflict — entity was modified by another process. " +
      `Expected version ${expectedVersion}, current version is different.`
  );
}
```

### 4.4 Endpoint Pattern for All Entity Types

Every entity type follows the same REST pattern:

| Resource | List | Detail | Versions | Create | Update |
|---|---|---|---|---|---|
| `/api/v1/utilities` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/isos` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/rtos` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/balancing-authorities` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/regions` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/power-plants` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/ev-stations` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/transmission-lines` | ✅ | ✅ `/:id` | ✅ | ✅ | ✅ |
| `/api/v1/pricing-nodes` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |
| `/api/v1/programs` | ✅ | ✅ `/:slug` | ✅ | ✅ | ✅ |

**Entity-specific filters:**

| Resource | Additional Filters |
|---|---|
| `power-plants` | `state`, `fuelCategory`, `status`, `utilityId`, `baId`, `minCapacityMw`, `maxCapacityMw`, `lat`, `lng`, `radius` (km) |
| `ev-stations` | `state`, `city`, `network`, `accessCode`, `statusCode`, `hasLevel2`, `hasDcFast`, `lat`, `lng`, `radius` (km) |
| `transmission-lines` | `voltageClass`, `owner`, `status`, `minVoltage`, `maxVoltage` |
| `pricing-nodes` | `iso`, `nodeType`, `state`, `zone`, `lat`, `lng`, `radius` (km) |
| `programs` | `status`, `assetType`, `marketSegment`, `gridService`, `organizationId` |
| `regions` | `type`, `state` |
| `balancing-authorities` | `isoId`, `state` |

### 4.5 Spatial Query Endpoints

#### Nearest-Neighbor

```
GET /api/v1/power-plants?lat=40.7128&lng=-74.006&radius=50&sort=distance&limit=10
```

Returns the 10 closest power plants within 50 km, sorted by distance. Uses GEOGRAPHY for accurate spherical distance and SPGIST index for fast NN:

```sql
SELECT *,
  ST_Distance(geography, ST_Point(-74.006, 40.7128)::geography) / 1000 AS distance_km
FROM power_plants
WHERE ST_DWithin(geography, ST_Point(-74.006, 40.7128)::geography, 50000)
ORDER BY geography <-> ST_Point(-74.006, 40.7128)::geography
LIMIT 10;
```

#### Bounding Box

```
GET /api/v1/ev-stations?bbox=-74.5,40.4,-73.5,41.0&limit=200
```

Returns EV stations within the bounding box. Uses derived GEOMETRY column for fast planar bbox:

```sql
SELECT * FROM ev_stations
WHERE geometry && ST_MakeEnvelope(-74.5, 40.4, -73.5, 41.0, 4326)
LIMIT 200;
```

#### Territory Lookup

```
GET /api/v1/territories/lookup?lat=35.7796&lng=-78.6382
```

Returns all territories containing the point, using bbox pre-filter + `ST_Covers`:

```sql
SELECT t.id, r.name, r.type, r.state
FROM territories t
JOIN regions r ON r.id = t.region_id
WHERE t.bbox && ST_MakePoint(-78.6382, 35.7796)
  AND ST_Covers(t.geography, ST_Point(-78.6382, 35.7796)::geography)
ORDER BY r.type;
```

### 4.6 Territory Geometry Endpoint

#### `GET /api/v1/territories/:id/geometry`

Returns GeoJSON geometry for a territory.

| Param | Type | Description |
|---|---|---|
| `simplify` | float | Simplification tolerance in degrees (e.g., `0.001` for ~100m) |
| `format` | string | `geojson` (default) or `topojson` |

**Recommended simplification tolerances:**

| Use Case | Tolerance | Precision | ~Vertex Reduction |
|---|---|---|---|
| Detail view highlight | `0.001` | ~100m | 5-10x |
| Overview map | `0.01` | ~1km | 20-50x |
| National view | `0.1` | ~10km | 100x+ |

```sql
SELECT ST_AsGeoJSON(
  CASE
    WHEN $simplify IS NOT NULL THEN ST_SimplifyPreserveTopology(geometry, $simplify)
    ELSE geometry
  END
) AS geojson
FROM territories
WHERE id = $id;
```

### 4.7 Global Search Endpoint

#### `GET /api/v1/search`

```
export const runtime = "edge";  // Edge Runtime for low latency
```

Search across all entity types simultaneously. Each subquery is limited individually, then the outer query picks the top results:

```sql
WITH ranked AS (
  (SELECT 'utility' AS entity_type, id, slug, name, segment AS subtitle,
    ts_rank(search_vector, websearch_to_tsquery('english', $query)) AS rank
   FROM utilities
   WHERE search_vector @@ websearch_to_tsquery('english', $query) OR name % $query
   ORDER BY rank DESC LIMIT $limit)
  UNION ALL
  (SELECT 'power_plant', id, slug, name, fuel_category,
    ts_rank(search_vector, websearch_to_tsquery('english', $query)) AS rank
   FROM power_plants
   WHERE search_vector @@ websearch_to_tsquery('english', $query) OR name % $query
   ORDER BY rank DESC LIMIT $limit)
  UNION ALL
  -- ... repeat for each entity type ...
)
SELECT * FROM ranked ORDER BY rank DESC;
```

The `LIMIT` inside each subquery prevents Postgres from scanning all 163K records when only 5 results per type are needed.

### 4.8 Bulk Operations (With Idempotency)

#### `POST /api/v1/utilities/bulk` *(Auth required: `utilities:write` scope)*

```json
{
  "idempotencyKey": "eia-861-sync-2026-04-14",
  "operations": [
    { "action": "upsert", "data": { "id": "...", "slug": "...", "name": "..." } }
  ],
  "changeSummary": "EIA-861 annual sync 2025",
  "source": "EIA-861"
}
```

**Server-side idempotency logic:**

```typescript
export async function handleBulkOperation(req: BulkRequest) {
  const { idempotencyKey } = req;

  // Check for existing operation
  const existing = await db
    .select()
    .from(bulkOperations)
    .where(eq(bulkOperations.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].status === "completed") {
      return existing[0].result; // Return cached result
    }
    if (existing[0].status === "pending") {
      throw new ApiError("CONFLICT", "Operation already in progress");
    }
  }

  // Record the operation
  await db.insert(bulkOperations).values({
    idempotencyKey,
    status: "pending",
  });

  try {
    const result = await executeBulkUpsert(req);

    await db
      .update(bulkOperations)
      .set({ status: "completed", completedAt: new Date(), result })
      .where(eq(bulkOperations.idempotencyKey, idempotencyKey));

    return result;
  } catch (error) {
    await db
      .update(bulkOperations)
      .set({ status: "failed", result: { error: error.message } })
      .where(eq(bulkOperations.idempotencyKey, idempotencyKey));
    throw error;
  }
}
```

This makes sync scripts safe to retry — if a sync crashes after 50% completion and restarts, the completed operation is detected and the cached result is returned.

### 4.9 Dataset Snapshots

#### `GET /api/v1/snapshots`

List available downloadable dataset dumps. Generated nightly by a GitHub Actions cron job that exports all tables to JSON and uploads to Vercel Blob storage.

### 4.10 Error Responses

All errors include a `request_id` for traceability:

```typescript
interface ApiError {
  error: {
    code: string;         // Machine-readable error code
    message: string;      // Human-readable description
    request_id: string;   // Unique request identifier for debugging
    timestamp: string;    // ISO 8601 timestamp
    details?: unknown;    // Optional validation errors, etc.
  };
}
```

**Request ID generation in middleware:**

```typescript
export function withRequestId(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
    // Available throughout the request lifecycle
    const response = await handler(req, { ...ctx, requestId });
    response.headers.set("X-Request-Id", requestId);
    return response;
  };
}
```

**Standard error codes:**

| HTTP Status | Code | Description |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid query parameters or request body |
| 400 | `VALIDATION_ERROR` | Zod validation failure (includes `details`) |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 403 | `FORBIDDEN` | API key lacks required scope |
| 404 | `NOT_FOUND` | Entity not found |
| 409 | `CONFLICT` | Version conflict or duplicate slug/ID |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 5. Migration Strategy

### 5.1 Seed Script Architecture

The seed script reads all existing JSON files and inserts them into PostgreSQL with full geometry validation.

```
data/utilities.json        → utilities table (3,133 rows)
data/isos.json             → isos table (7 rows)
data/rtos.json             → rtos table (7 rows)
data/balancing-authorities.json → balancing_authorities table (45 rows)
data/regions.json          → regions table (3,000 rows)
data/programs.json         → programs table (607 rows)
data/power-plants.json     → power_plants table (15,082 rows)
data/ev-charging.json      → ev_stations table (85,425 rows)
data/transmission-lines.json → transmission_lines table (52,244 rows)
data/pricing-nodes.json    → pricing_nodes table (4,065 rows)
data/territories/*.json    → territories table (~3,000 rows)
```

**Script structure:**

```typescript
// scripts/seed-database.ts
async function main() {
  // Seed in dependency order
  await seedTable("regions", regions, regionsData, transformRegion);
  await seedTable("isos", isos, isosData, transformIso);
  await seedTable("rtos", rtos, rtosData, transformRto);
  await seedTable("balancing_authorities", balancingAuthorities, basData, transformBA);
  await seedTable("utilities", utilities, utilitiesData, transformUtility);
  await seedTable("programs", programs, programsData, transformProgram);
  await seedTable("power_plants", powerPlants, plantsData, transformPowerPlant);
  await seedTable("ev_stations", evStations, evData, transformEvStation);
  await seedTable("transmission_lines", transmissionLines, tlData, transformTransmissionLine);
  await seedTable("pricing_nodes", pricingNodes, pnData, transformPricingNode);
  await seedTerritories();

  // Deep validation
  await validateMigration();

  // Spatial benchmarks
  await benchmarkSpatialQueries();
}
```

### 5.2 Territory Seeding with Geometry Validation

```typescript
async function seedTerritories() {
  const territoriesDir = path.join(process.cwd(), "data", "territories");
  const files = fs.readdirSync(territoriesDir);

  let validCount = 0;
  let invalidCount = 0;
  const errors: string[] = [];

  for (const file of files) {
    const eiaId = path.basename(file, ".json");
    const geojson = JSON.parse(fs.readFileSync(path.join(territoriesDir, file), "utf-8"));

    const region = await db
      .select()
      .from(regions)
      .where(eq(regions.eiaId, eiaId))
      .limit(1);
    if (!region.length) continue;

    const feature = geojson.features[0];
    const geometry =
      feature.geometry.type === "Polygon"
        ? { type: "MultiPolygon", coordinates: [feature.geometry.coordinates] }
        : feature.geometry;

    try {
      // Validate, fix, and snap geometry
      const [result] = await db.execute(sql`
        WITH raw AS (
          SELECT ST_GeomFromGeoJSON(${JSON.stringify(geometry)}) AS geom
        ),
        validated AS (
          SELECT
            CASE
              WHEN ST_IsValid(geom) THEN geom
              ELSE ST_MakeValid(geom)
            END AS geom
          FROM raw
        ),
        snapped AS (
          SELECT ST_SnapToGrid(geom, 0.000001) AS geom
          FROM validated
        )
        SELECT
          ST_IsValid(geom) AS is_valid,
          ST_IsValidReason(geom) AS validation_message,
          geom
        FROM snapped
      `);

      if (!result.is_valid) {
        errors.push(`${file}: ${result.validation_message}`);
        invalidCount++;
        continue;
      }

      await db.execute(sql`
        INSERT INTO territories (id, region_id, geography, source)
        VALUES (
          ${region[0].id},
          ${region[0].id},
          ${result.geom}::geography,
          'EIA-861'
        )
        ON CONFLICT (id) DO NOTHING
      `);

      validCount++;
    } catch (err) {
      errors.push(`${file}: ${(err as Error).message}`);
      invalidCount++;
    }
  }

  console.log(`✅ Valid territories: ${validCount}`);
  console.log(`❌ Invalid territories: ${invalidCount}`);
  if (errors.length > 0) {
    console.error("Errors:", errors);
    throw new Error("Territory validation failed — fix source GeoJSON before proceeding");
  }
}
```

### 5.3 Deep Migration Validation

```typescript
async function validateMigration() {
  console.log("\n=== Migration Validation ===\n");

  // 1. Row count checks
  const checks = [
    { table: "isos", expected: 7 },
    { table: "rtos", expected: 7 },
    { table: "balancing_authorities", expected: 45 },
    { table: "regions", expected: 3000 },
    { table: "utilities", expected: 3133 },
    { table: "programs", expected: 607 },
    { table: "power_plants", expected: 15082 },
    { table: "ev_stations", expected: 85425 },
    { table: "transmission_lines", expected: 52244 },
    { table: "pricing_nodes", expected: 4065 },
  ];

  for (const check of checks) {
    const [result] = await db.execute(
      sql`SELECT COUNT(*) AS count FROM ${sql.identifier(check.table)}`
    );
    const actual = Number(result.count);
    const status = actual === check.expected ? "✅" : "❌";
    console.log(`${status} ${check.table}: ${actual} / ${check.expected}`);
    if (actual !== check.expected) throw new Error(`Row count mismatch: ${check.table}`);
  }

  // 2. Spatial validity
  const [invalidGeoms] = await db.execute(sql`
    SELECT COUNT(*) AS count FROM territories
    WHERE NOT ST_IsValid(geography::geometry)
  `);
  console.log(`🔍 Invalid geometries: ${invalidGeoms.count}`);
  if (Number(invalidGeoms.count) > 0) throw new Error("Invalid geometries detected");

  // 3. Referential integrity
  const [orphanedUtils] = await db.execute(sql`
    SELECT COUNT(*) FROM utilities
    WHERE iso_id IS NOT NULL AND iso_id NOT IN (SELECT id FROM isos)
  `);
  if (Number(orphanedUtils.count) > 0) throw new Error("Orphaned utility ISO references");

  // 4. Spatial data sanity checks
  const [tinyTerrs] = await db.execute(sql`
    SELECT COUNT(*) AS count FROM territories WHERE area_sq_km < 10
  `);
  console.log(`⚠️  Territories smaller than Manhattan: ${tinyTerrs.count}`);

  const [hugeTerrs] = await db.execute(sql`
    SELECT COUNT(*) AS count FROM territories WHERE area_sq_km > 1000000
  `);
  console.log(`⚠️  Territories larger than Texas: ${hugeTerrs.count}`);

  // 5. Spot-check known entity
  const [duke] = await db.execute(sql`
    SELECT u.name, t.area_sq_km
    FROM utilities u
    JOIN territories t ON t.region_id = u.service_territory_id
    WHERE u.slug = 'duke-energy'
  `);
  console.log(`🔌 Duke Energy territory: ${duke?.area_sq_km?.toFixed(0)} sq km`);
  if (duke && (duke.area_sq_km < 40000 || duke.area_sq_km > 60000)) {
    console.warn("⚠️  Duke Energy territory size out of expected range!");
  }

  // 6. Round-trip validation: JSON → DB → compare
  const jsonUtility = JSON.parse(fs.readFileSync("data/utilities.json", "utf-8"))[0];
  const dbUtility = await db.query.utilities.findFirst({
    where: eq(utilities.id, jsonUtility.id),
  });
  console.log(`🔄 Round-trip check: ${jsonUtility.name} — ID match: ${dbUtility?.id === jsonUtility.id}`);

  console.log("\n✅ Migration validation complete\n");
}
```

### 5.4 Spatial Query Benchmarks

```typescript
async function benchmarkSpatialQueries() {
  console.log("\n=== Spatial Query Benchmarks ===\n");

  // Point-in-polygon (NYC)
  const start1 = performance.now();
  await db.execute(sql`
    SELECT u.name FROM utilities u
    JOIN territories t ON t.region_id = u.service_territory_id
    WHERE t.bbox && ST_MakePoint(-74.006, 40.7128)
      AND ST_Covers(t.geography, ST_Point(-74.006, 40.7128)::geography)
    LIMIT 5
  `);
  console.log(`Point-in-polygon (NYC): ${(performance.now() - start1).toFixed(1)}ms`);

  // Nearest-neighbor (10 power plants near NYC)
  const start2 = performance.now();
  await db.execute(sql`
    SELECT name FROM power_plants
    ORDER BY geography <-> ST_Point(-74.006, 40.7128)::geography
    LIMIT 10
  `);
  console.log(`Nearest-neighbor (10 plants): ${(performance.now() - start2).toFixed(1)}ms`);

  // Bounding box (map viewport)
  const start3 = performance.now();
  await db.execute(sql`
    SELECT COUNT(*) FROM ev_stations
    WHERE geometry && ST_MakeEnvelope(-74.5, 40.4, -73.5, 41.0, 4326)
  `);
  console.log(`Bounding box (NYC metro): ${(performance.now() - start3).toFixed(1)}ms`);

  // Full-text search
  const start4 = performance.now();
  await db.execute(sql`
    SELECT name FROM utilities
    WHERE search_vector @@ websearch_to_tsquery('english', 'duke energy')
    LIMIT 10
  `);
  console.log(`Full-text search: ${(performance.now() - start4).toFixed(1)}ms`);

  console.log("\n(All queries should be <20ms with proper indexes)\n");
}
```

### 5.5 Feature Flags for Dual-Mode Operation

**Critical for safe rollback.** Each entity type has a feature flag controlling whether data is read from the database or from JSON files:

```typescript
// lib/feature-flags.ts
export type DataSource = "database" | "json";

export const ENTITY_DATA_SOURCE: Record<string, DataSource> = {
  utilities: (process.env.NEXT_PUBLIC_FF_DB_UTILITIES as DataSource) || "json",
  isos: (process.env.NEXT_PUBLIC_FF_DB_ISOS as DataSource) || "json",
  rtos: (process.env.NEXT_PUBLIC_FF_DB_RTOS as DataSource) || "json",
  balancingAuthorities: (process.env.NEXT_PUBLIC_FF_DB_BAS as DataSource) || "json",
  regions: (process.env.NEXT_PUBLIC_FF_DB_REGIONS as DataSource) || "json",
  powerPlants: (process.env.NEXT_PUBLIC_FF_DB_POWER_PLANTS as DataSource) || "json",
  evStations: (process.env.NEXT_PUBLIC_FF_DB_EV_STATIONS as DataSource) || "json",
  transmissionLines: (process.env.NEXT_PUBLIC_FF_DB_TRANSMISSION as DataSource) || "json",
  pricingNodes: (process.env.NEXT_PUBLIC_FF_DB_PRICING_NODES as DataSource) || "json",
  programs: (process.env.NEXT_PUBLIC_FF_DB_PROGRAMS as DataSource) || "json",
};

// lib/api/utilities.ts
export async function getAllUtilities(params?: UtilityQueryParams) {
  if (ENTITY_DATA_SOURCE.utilities === "json") {
    // Fallback to static JSON
    const data = await import("@/data/utilities.json").then((m) => m.default);
    return { data, pagination: { cursor: null, limit: data.length, total: data.length, hasMore: false } };
  }
  // Database-backed API call
  return fetchFromApi("/api/v1/utilities", params);
}
```

**Rollback procedure:** If a migrated entity has performance issues in production:
1. Set `NEXT_PUBLIC_FF_DB_UTILITIES=json` in Vercel environment variables
2. Trigger redeploy (instant — no code change needed)
3. All utility reads revert to JSON files
4. Investigate and fix the DB issue, then flip back to `database`

### 5.6 Transition Plan

1. **JSON files remain in the repo as read-only archive** during the transition. Feature flags can revert any entity to JSON at any time.
2. **Sync scripts check the feature flag** for each entity type. If `database`, write to the API. If `json`, write to JSON files.
3. **PMTiles continue to be served from `public/tiles/`** — tile serving is unchanged. Only tile generation source changes.
4. **`lib/data.ts` is gradually replaced** — entity by entity, behind feature flags.
5. **After 1 month of stable database operation**, JSON fallback code is removed and JSON files are archived.

---

## 6. Explorer Migration Plan

### 6.1 Strategy: Incremental, Entity by Entity, Behind Feature Flags

The explorer currently uses two data loading patterns:
1. **Static imports** (`lib/data.ts`) — for small datasets (~6 MB bundled at build time).
2. **Client-side fetch hooks** (`lib/power-plants.ts`, etc.) — for large datasets (~70 MB fetched on-demand).

Both are replaced with a **hybrid approach**:
- **Server Components** for initial page load (Server Actions for dynamic filtering)
- **Client Components** for interactive filtering, using the API with SWR for caching
- **Lightweight client-side index** (~150KB) for map tile filtering — no full dataset needed
- **On-demand revalidation** via cache tags (not time-based ISR)

### 6.2 On-Demand Revalidation (Not Time-Based ISR)

**Do not use `revalidate: 3600`** — CommonGrid's data updates via sync scripts on unpredictable schedules. Time-based ISR means users may see stale data for up to an hour after a sync.

**Correct approach — cache tags + on-demand revalidation:**

```typescript
// app/power-plants/page.tsx (Server Component)
export default async function PowerPlantsPage({ searchParams }) {
  const data = await fetch(`${API_URL}/api/v1/power-plants?${new URLSearchParams(searchParams)}`, {
    next: {
      tags: ["power-plants"],  // Cache tag for invalidation
      revalidate: false,       // Don't auto-revalidate
    },
  }).then((r) => r.json());

  return <PowerPlantsList initialData={data} />;
}
```

```typescript
// app/api/revalidate/route.ts
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const token = request.headers.get("x-revalidate-token");
  if (token !== process.env.REVALIDATE_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tag } = await request.json();
  revalidateTag(tag);
  return Response.json({ revalidated: true, tag, now: Date.now() });
}
```

```typescript
// In sync scripts — after successful sync
async function afterSync(entityType: string) {
  await fetch(`${process.env.NEXT_PUBLIC_URL}/api/revalidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-revalidate-token": process.env.REVALIDATE_TOKEN!,
    },
    body: JSON.stringify({ tag: entityType }),
  });
}
```

### 6.3 Server Actions for Dynamic Filtering

Use Server Actions instead of client-side fetch to API routes for interactive filtering:

```typescript
// app/power-plants/actions.ts
"use server";

import { db } from "@/lib/db/client";

export async function getPowerPlants(filters: PowerPlantFilters) {
  const results = await db.query.powerPlants.findMany({
    where: buildWhereClause(filters),
    limit: filters.limit || 50,
    orderBy: [asc(powerPlants.name)],
  });
  return results;
}
```

```typescript
// components/PowerPlantsClientList.tsx
"use client";
import { getPowerPlants } from "@/app/power-plants/actions";

export function PowerPlantsClientList({ initialData }: { initialData: PowerPlant[] }) {
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();

  const handleFilterChange = (newFilters: PowerPlantFilters) => {
    startTransition(async () => {
      const result = await getPowerPlants(newFilters);
      setData(result);
    });
  };

  return <DataTable data={data} isLoading={isPending} />;
}
```

### 6.4 Hybrid Data Fetching Strategy

**For entities with <1,000 records** (utilities, ISOs, RTOs, BAs, programs):
1. Load all records once via Server Component initial props
2. Filter client-side for instant feedback
3. Optionally debounce and re-fetch from API for authoritative results

**For entities with >1,000 records** (power plants, EV stations, transmission lines):
1. Always use server-side filtering + pagination
2. Add optimistic UI for filter changes
3. Use SWR for caching and deduplication

```typescript
// For small datasets — client-side filtering with optimistic UI
export function UtilityListPanel({ initialUtilities }: { initialUtilities: Utility[] }) {
  const [utilities] = useState(initialUtilities);

  // Client-side filtering (instant)
  const filtered = useMemo(() => {
    let result = utilities;
    if (state.q) result = result.filter((u) => u.name.toLowerCase().includes(state.q.toLowerCase()));
    if (state.segment !== "all") result = result.filter((u) => u.segment === state.segment);
    return sortByName(result, "asc");
  }, [utilities, state.q, state.segment]);

  return <DataTable data={filtered} />;
}

// For large datasets — server-side filtering with SWR
export function PowerPlantListPanel() {
  const { data, isLoading } = useSWR(
    `/api/v1/power-plants?state=${state.state}&fuelCategory=${state.fuel}&cursor=${cursor}`,
    fetcher
  );

  return <DataTable data={data?.data} isLoading={isLoading} />;
}
```

### 6.5 Lightweight Client-Side Utility Index for Map Filtering

The Explorer map needs to filter tile layers synchronously (Mapbox expressions). We can't make this async. Solution: preload a lightweight index (~150 KB) via Server Component:

```typescript
// app/(shell)/explore/page.tsx (Server Component)
export default async function ExplorePage() {
  // Lightweight index: slug + name + segment only (~150 KB for 3000 utilities)
  const utilityIndex = await fetch(`${API_URL}/api/v1/utilities?fields=slug,name,segment&limit=5000`, {
    next: { tags: ["utilities"] },
  })
    .then((r) => r.json())
    .then((d) => d.data);

  return <ExplorerShell initialUtilityIndex={utilityIndex} />;
}
```

```typescript
// components/explorer/ExplorerMap.tsx
const territoryFilter = useMemo(() => {
  if (state.q) {
    const matching = state.utilityIndex.filter((u) =>
      u.name.toLowerCase().includes(state.q.toLowerCase())
    );
    const slugs = matching.map((u) => u.slug);
    return ["in", ["get", "slug"], ["literal", slugs]];
  }
  return null;
}, [state.utilityIndex, state.q, state.segment]);
```

**Payload:** 3,000 utilities × ~50 bytes = ~150 KB. Negligible compared to the 3 MB saved by removing the full JSON import.

### 6.6 Debounced Search with Optimistic UI

```typescript
export function SearchPanel({ initialData }: { initialData: Entity[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [displayedResults, setDisplayedResults] = useState(initialData);
  const [isSearching, setIsSearching] = useState(false);

  // Optimistic: instant client-side filter from current data
  const optimisticResults = useMemo(() => {
    if (!searchQuery) return displayedResults;
    return displayedResults.filter((e) =>
      e.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [displayedResults, searchQuery]);

  // Authoritative: debounced API fetch (300ms)
  useEffect(() => {
    if (!searchQuery) {
      setDisplayedResults(initialData);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/v1/search?q=${encodeURIComponent(searchQuery)}&limit=5`)
        .then((r) => r.json())
        .then((res) => {
          setDisplayedResults(res.data);
          setIsSearching(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, initialData]);

  return (
    <div>
      <SearchInput value={searchQuery} onChange={setSearchQuery} />
      <DataTable data={optimisticResults} isLoading={isSearching} />
    </div>
  );
}
```

### 6.7 Prefetch Strategy for Pagination

Preload the next page on hover for instant pagination:

```typescript
import useSWR from "swr";

function PaginationControls({ nextCursor }: { nextCursor: string | null }) {
  const { mutate } = useSWRConfig();

  const handleMouseEnter = () => {
    if (nextCursor) {
      // Prefetch next page into SWR cache
      mutate(
        `/api/v1/power-plants?cursor=${nextCursor}`,
        fetch(`/api/v1/power-plants?cursor=${nextCursor}`).then((r) => r.json()),
        { revalidate: false }
      );
    }
  };

  return (
    <button onMouseEnter={handleMouseEnter} onClick={() => navigateTo(nextCursor)}>
      Next Page
    </button>
  );
}
```

### 6.8 Decoupled Map Data vs List Data

The map shows **all entities** (via tile layers) while the list shows **paginated results**:

```typescript
// Map needs: all slugs for filtering (lightweight)
const { data: allSlugs } = useSWR(
  "/api/v1/utilities?fields=slug,name&limit=5000",
  fetcher,
  { revalidateOnFocus: false }
);

// List needs: full entities (paginated)
const { data: pageData } = useSWR(
  `/api/v1/utilities?cursor=${cursor}&limit=50`,
  fetcher
);
```

### 6.9 Skeleton Loading States

Every page migrated from static imports to API fetching needs loading states:

```typescript
function UtilityListPage() {
  const { data, isLoading } = useSWR("/api/v1/utilities", fetcher);

  return (
    <div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {isLoading ? "Loading utilities..." : `${data?.pagination.total} utilities loaded`}
      </div>
      {isLoading ? <DataTableSkeleton rows={10} /> : <DataTable data={data.data} />}
    </div>
  );
}
```

**Required skeleton components:**
- `<DataTableSkeleton />` — shimmer loading for table rows
- `<MapSkeleton />` — placeholder for map tiles loading
- `<EntityDetailSkeleton />` — loading state for detail pages
- `<FiltersSkeleton />` — loading state for filter chips

### 6.10 Landing Page Optimization

The landing page currently imports `lib/data.ts`, bundling ~4.5 MB. After migration, it uses count-only queries:

```typescript
// app/(shell)/page.tsx (Server Component)
export default async function LandingPage() {
  const [utilityCount, programCount, plantCount, evCount] = await Promise.all([
    fetch(`${API_URL}/api/v1/utilities?limit=1`, { next: { tags: ["utilities"] } })
      .then((r) => r.json())
      .then((d) => d.pagination.total),
    fetch(`${API_URL}/api/v1/programs?limit=1`, { next: { tags: ["programs"] } })
      .then((r) => r.json())
      .then((d) => d.pagination.total),
    fetch(`${API_URL}/api/v1/power-plants?limit=1`, { next: { tags: ["power-plants"] } })
      .then((r) => r.json())
      .then((d) => d.pagination.total),
    fetch(`${API_URL}/api/v1/ev-stations?limit=1`, { next: { tags: ["ev-stations"] } })
      .then((r) => r.json())
      .then((d) => d.pagination.total),
  ]);

  return <LandingPageUI counts={{ utilityCount, programCount, plantCount, evCount }} />;
}
```

**Payload:** ~200 bytes (four integers) instead of 4.5 MB.

---

## 7. Sync Pipeline Updates

### 7.1 Current Pipeline

```
EIA API / HIFLD / AFDC / ISO APIs
        ↓
  sync-*.ts scripts
        ↓
  data/*.json files (committed to repo)
        ↓
  prepare-*-geojson.mjs scripts
        ↓
  build-tiles.sh (tippecanoe)
        ↓
  public/tiles/*.pmtiles
```

### 7.2 New Pipeline

```
EIA API / HIFLD / AFDC / ISO APIs
        ↓
  sync-*.ts scripts
        ↓
  CommonGrid Write API (/api/v1/*/bulk) with idempotency keys
        ↓
  PostgreSQL + PostGIS (creates delta-based versions)
        ↓
  revalidateTag() (bust Next.js cache immediately)
        ↓
  async: export-geojson.ts (streaming, batched PostGIS → GeoJSON)
        ↓
  async: build-tiles.sh (tippecanoe)
        ↓
  public/tiles/*.pmtiles (or Vercel Blob/R2)
```

### 7.3 Sync Script Changes

```typescript
// scripts/sync-ev-charging.ts (new)
const stations = await fetchFromAFDC();
const transformed = stations.map(transformStation);

const response = await fetch(`${API_URL}/api/v1/ev-stations/bulk`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify({
    idempotencyKey: `afdc-sync-${new Date().toISOString().split("T")[0]}`,
    operations: transformed.map((station) => ({ action: "upsert", data: station })),
    changeSummary: `AFDC sync ${new Date().toISOString().split("T")[0]}`,
    source: "AFDC",
  }),
});

const result = await response.json();
console.log(`Sync: ${result.data.created} created, ${result.data.updated} updated`);

// Trigger cache invalidation (immediate — data available to users)
await afterSync("ev-stations");

// Trigger async tile rebuild (non-blocking — map updates in ~10 min)
await fetch(`${API_URL}/api/admin/rebuild-tiles`, {
  method: "POST",
  headers: { Authorization: `Bearer ${ADMIN_API_KEY}` },
  body: JSON.stringify({ layers: ["ev-stations"] }),
});
```

### 7.4 Streaming GeoJSON Export for Tile Pipeline

The tile pipeline exports GeoJSON from PostGIS in batches (not loading all into memory):

```typescript
// scripts/export-geojson.ts
import { createWriteStream } from "node:fs";

async function exportGeoJSON(tableName: string, outputPath: string, query: string) {
  const outStream = createWriteStream(outputPath);
  outStream.write('{"type":"FeatureCollection","features":[');

  let isFirst = true;
  let offset = 0;
  const BATCH_SIZE = 1000;

  while (true) {
    const rows = await db.execute(sql.raw(`${query} LIMIT ${BATCH_SIZE} OFFSET ${offset}`));

    if (rows.length === 0) break;

    for (const row of rows) {
      if (!isFirst) outStream.write(",\n");
      isFirst = false;
      outStream.write(JSON.stringify(row.feature));
    }

    offset += BATCH_SIZE;
    console.log(`  Exported ${offset} ${tableName}...`);
  }

  outStream.write("]}");
  outStream.end();

  return new Promise<void>((resolve, reject) => {
    outStream.on("finish", resolve);
    outStream.on("error", reject);
  });
}

// Export power plants (15K records, ~2MB per batch)
await exportGeoJSON(
  "power_plants",
  "tmp/power-plants.geojson",
  `SELECT json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(geometry)::json,
    'properties', json_build_object(
      'id', id, 'name', name, 'fuelCategory', fuel_category,
      'totalCapacityMw', total_capacity_mw, 'status', status
    )
  ) AS feature FROM power_plants ORDER BY id`
);

// Export EV stations (85K records — streaming prevents OOM)
await exportGeoJSON(
  "ev_stations",
  "tmp/ev-stations.geojson",
  `SELECT json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(geometry)::json,
    'properties', json_build_object(
      'id', id, 'name', station_name, 'network', ev_network,
      'accessCode', access_code, 'dcFast', ev_dc_fast_num
    )
  ) AS feature FROM ev_stations ORDER BY id`
);
```

### 7.5 Async Tile Regeneration

Tile regeneration is **decoupled** from the sync pipeline. Sync scripts write to the DB and trigger cache invalidation immediately. Tile rebuilds happen asynchronously:

```typescript
// app/api/admin/rebuild-tiles/route.ts
export async function POST(request: Request) {
  // Auth check...
  const { layers } = await request.json();

  // Queue tile rebuild as background job
  // Option A: Vercel Cron triggered endpoint
  // Option B: GitHub Actions workflow dispatch
  await fetch("https://api.github.com/repos/TextureHQ/commongrid/dispatches", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "rebuild-tiles",
      client_payload: { layers },
    }),
  });

  return Response.json({ queued: true, layers });
}
```

**Benefits:**
- Sync completes in ~5 min (data available immediately via API)
- Tiles rebuild in background (~10 min, map updates later)
- Sync failures don't block tile generation and vice versa

### 7.6 GitHub Actions Cron

```yaml
# .github/workflows/sync.yml
name: Data Sync
on:
  schedule:
    - cron: "0 4 * * *"  # Daily at 4 AM UTC
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci

      - name: Sync EV Charging (AFDC)
        run: npx tsx scripts/sync-ev-charging.ts
        env:
          COMMONGRID_API_URL: ${{ secrets.COMMONGRID_API_URL }}
          COMMONGRID_API_KEY: ${{ secrets.COMMONGRID_API_KEY }}
          NREL_API_KEY: ${{ secrets.NREL_API_KEY }}

      - name: Sync Power Plants (EIA-860M)
        run: npx tsx scripts/sync-power-plants-monthly.ts
        env:
          COMMONGRID_API_URL: ${{ secrets.COMMONGRID_API_URL }}
          COMMONGRID_API_KEY: ${{ secrets.COMMONGRID_API_KEY }}

  rebuild-tiles:
    needs: sync
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci

      - name: Install tippecanoe
        run: sudo apt-get install -y tippecanoe

      - name: Export GeoJSON from DB
        run: npx tsx scripts/export-geojson.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Build tiles
        run: bash scripts/build-tiles.sh

      - name: Upload tiles
        run: npx tsx scripts/upload-tiles.ts
        env:
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
```

---

## 8. What We Decided NOT To Do (and Why)

### ❌ Elasticsearch

| Factor | Decision |
|---|---|
| **Scale** | ~163K total records. PostgreSQL handles this in its sleep. |
| **Data model** | Fundamentally relational. ES would lose referential integrity. |
| **Spatial** | PostGIS is the gold standard for geospatial queries. |
| **Operations** | Single-source-of-truth in Postgres is simpler than dual data stores. |
| **Search quality** | `pg_trgm` + `tsvector` with weighted ranks is sufficient at this scale. |
| **Revisit when** | >1M records, need faceted search analytics, or complex relevance tuning. |

### ❌ GraphQL

| Factor | Decision |
|---|---|
| **Access patterns** | Predictable, read-heavy. REST's fixed shapes are a feature. |
| **Caching** | REST caches trivially with HTTP headers. GraphQL needs persisted queries. |
| **Complexity** | REST routes are ~20 lines each. GraphQL adds schema, resolvers, dataloaders. |
| **Revisit when** | 10+ external consumers with different data needs, or mobile app. |

### ❌ Dynamic PostGIS Tile Serving (ST_AsMVT)

PMTiles are fast (near-zero latency, no DB roundtrip), cost nothing to serve, and tippecanoe produces excellent tiles. Dynamic tiles make sense for real-time data — CommonGrid doesn't need that.

### ❌ Separate API Server

The Next.js app already has API routes for tiles. One deployment unit (Vercel) simplifies CI/CD. At <1000 RPM, Next.js API routes have sufficient throughput.

### ❌ Supabase

CommonGrid needs a database and nothing else — Neon (scale-to-zero, branching, Texture prior art) is the leaner choice.

### ❌ Full JSONB Snapshots for Version History

Full snapshots of every version would consume ~3 GB/year. Delta-based versioning gives ~75x storage reduction. See Section 3.6.

### ❌ Time-Based ISR (`revalidate: 3600`)

CommonGrid data updates via sync scripts on unpredictable schedules. Time-based ISR means up to 1 hour of stale data after a sync. On-demand revalidation via cache tags ensures instant freshness. See Section 6.2.

### ❌ React Query

SWR (~5 KB) + Server Actions is lighter than React Query (~20 KB) and better integrated with Next.js. We don't need React Query's advanced features (optimistic mutations, infinite queries) for this use case.

### ❌ H3 Spatial Indexing (Phase 1)

H3 hexagonal indexing could provide <2ms point-in-polygon lookups (vs. 5-10ms with PostGIS). But it adds complexity (requires `h3_pg` extension, materialized view refresh on territory updates) and our current approach meets the <20ms target.

**Revisit if:** Spatial query traffic exceeds 500 req/s or we need sub-5ms point-in-polygon.

### ❌ PostGIS Topology Model (Phase 1)

PostGIS topology enforces shared boundaries between adjacent polygons — better storage efficiency and adjacency queries. But it's complex to set up and requires careful migration.

**Revisit if:** We add "find all utilities adjacent to Duke Energy" features or storage exceeds 50 GB.

### ❌ Migrating All Datasets in Phase 1

Starting with low-risk, standalone pages (pricing nodes, programs, transmission lines) proves the API before touching the high-risk Explorer.

---

## 9. Implementation Phases

Phases are ordered by **frontend complexity** and **risk**, not by database table dependencies. Low-risk standalone pages first, high-risk Explorer refactor last.

### Phase 1a: Foundation (Week 1–2)

**Goal:** Database provisioned, schema defined, data seeded and validated.

| Task | Description | Estimate |
|---|---|---|
| **1a.1** | Provision Neon Postgres with PostGIS, pg_trgm extensions | 0.5 day |
| **1a.2** | Set up Drizzle ORM with Neon serverless driver | 0.5 day |
| **1a.3** | Define Drizzle schema for ALL entities (core + extended) | 1.5 days |
| **1a.4** | Define `territories` table with GEOGRAPHY type + generated columns | 0.5 day |
| **1a.5** | Define `entity_versions` (delta-based), `api_keys` (scoped), `bulk_operations` (idempotency) | 0.5 day |
| **1a.6** | Create `update_timestamp()` trigger function, apply to all tables | 0.5 day |
| **1a.7** | Run `drizzle-kit push` to create schema in Neon | 0.5 day |
| **1a.8** | Build seed script for all entities with geometry validation | 2 days |
| **1a.9** | Build delta-based versioning middleware | 0.5 day |
| **1a.10** | Run seed, deep validation, spatial benchmarks | 1 day |
| **1a.11** | Set up feature flags for dual-mode operation | 0.5 day |
| **1a.12** | Set up Neon keep-alive cron (every 4 min during business hours) | 0.5 day |

**Deliverable:** Neon database with ALL entities seeded. Territories loaded as GEOGRAPHY with validation. Spatial benchmarks passing <20ms. Feature flag infrastructure ready.

### Phase 1b: Low-Risk API + Pages (Week 2–4)

**Goal:** Standalone pages migrated to API. Proves the pattern before touching Explorer.

| Task | Description | Estimate |
|---|---|---|
| **1b.1** | Build API route handler utilities (pagination, filtering, error handling, request ID) | 1 day |
| **1b.2** | Implement HMAC-signed cursor pagination | 0.5 day |
| **1b.3** | Implement rate limiting via Upstash Redis | 0.5 day |
| **1b.4** | Auth middleware (provider-agnostic, resource:action scopes) | 0.5 day |
| **1b.5** | `GET /api/v1/pricing-nodes` endpoints (list, detail, versions) | 1 day |
| **1b.6** | `GET /api/v1/programs` endpoints | 1 day |
| **1b.7** | `GET /api/v1/transmission-lines` endpoints | 0.5 day |
| **1b.8** | Migrate pricing nodes page to API (standalone, low risk) | 1 day |
| **1b.9** | Migrate programs page to API (no map layer, simple filtering) | 1 day |
| **1b.10** | Migrate transmission lines metadata to API (map uses tiles) | 0.5 day |
| **1b.11** | Build skeleton loading components | 0.5 day |
| **1b.12** | Set up on-demand revalidation via cache tags | 0.5 day |
| **1b.13** | Zod validation schemas for all query parameters | 0.5 day |
| **1b.14** | `GET /api/v1/search` (global search, Edge Runtime) | 1 day |

**Success criteria:**
- [ ] Bundle size reduced by >50% (remove programs.json, pricing-nodes.json)
- [ ] LCP <2.5s on all migrated pages
- [ ] Search <100ms P95
- [ ] Feature flag rollback tested end-to-end
- [ ] Zero accessibility regressions

### Phase 1c: Large Dataset Migration (Week 4–5)

**Goal:** Power plants + EV stations prove pagination and search at scale.

| Task | Description | Estimate |
|---|---|---|
| **1c.1** | `GET /api/v1/power-plants` with spatial queries, filtering, pagination | 1 day |
| **1c.2** | `GET /api/v1/ev-stations` with spatial queries, filtering, pagination | 1 day |
| **1c.3** | Sparse field projection (`?fields=slug,name,segment`) | 0.5 day |
| **1c.4** | Migrate power plants page (Server Action + SWR, 15K records) | 2 days |
| **1c.5** | Migrate EV stations page (validates cursor pagination at 85K scale) | 2 days |
| **1c.6** | Implement prefetch strategy for pagination | 0.5 day |
| **1c.7** | Debounced search with optimistic UI | 0.5 day |

**Success criteria:**
- [ ] Cursor pagination smooth (no flicker on page change)
- [ ] Search <50ms P95 (Edge API Route + optimistic UI)
- [ ] Map + list sync maintained during filter changes
- [ ] Prefetching reduces "Next Page" latency to <50ms

### Phase 2a: Write API + Sync Pipeline (Week 5–6)

**Goal:** Authenticated write API, sync scripts updated.

| Task | Description | Estimate |
|---|---|---|
| **2a.1** | Write endpoints for all entity types with optimistic locking | 2 days |
| **2a.2** | Bulk upsert with idempotency keys | 1 day |
| **2a.3** | Delta-based version creation on every write | 0.5 day |
| **2a.4** | Update sync scripts to use API (with idempotency) | 2 days |
| **2a.5** | Streaming GeoJSON export from PostGIS | 1 day |
| **2a.6** | Async tile rebuild pipeline | 0.5 day |
| **2a.7** | Integration tests for write API + versioning | 1 day |

### Phase 2b: Explorer Migration (Week 6–8)

**Goal:** Core Explorer entities migrated. This is the highest-risk phase.

| Task | Description | Estimate |
|---|---|---|
| **2b.1** | Endpoints for ISOs, RTOs, BAs, regions (small datasets, tightly coupled) | 1 day |
| **2b.2** | Endpoint for utilities (full filtering, spatial, includes) | 1 day |
| **2b.3** | Build lightweight utility index for map tile filtering (~150 KB) | 0.5 day |
| **2b.4** | Migrate ISO/RTO/BA Explorer tabs | 2 days |
| **2b.5** | Migrate regions + territory spatial queries | 1 day |
| **2b.6** | Migrate utilities (most complex — touches every Explorer component) | 3 days |
| **2b.7** | Refactor ExplorerContext to support API-backed data | 1 day |
| **2b.8** | Territory geometry endpoint with simplification | 0.5 day |
| **2b.9** | Territory lookup endpoint (spatial) | 0.5 day |
| **2b.10** | Platform integration endpoints (`/lookup?eiaId=...`, `/by-location?lat=...&lng=...`) | 1 day |

**Success criteria:**
- [ ] ExplorerContext works with API data
- [ ] Map tile filtering works with lightweight utility index
- [ ] Search maintains instant-feel (<50ms perceived latency)
- [ ] All 6 entity tabs functional
- [ ] Zero UX regressions vs. current app

### Phase 3: Community & Public API (Future)

| Task | Description |
|---|---|
| **3.1** | OAuth 2.0 via Auth0 for external developer access |
| **3.2** | Rate limiting tiers (free / paid) |
| **3.3** | Community proposal workflow: submit → review → accept/reject |
| **3.4** | Public API documentation (OpenAPI spec) |
| **3.5** | Version pruning cron (monthly consolidation, 3-year archive) |
| **3.6** | PWA support with offline caching |
| **3.7** | Load testing with k6 (validate 100 RPS at <200ms p95) |

### Risk Mitigation

| Risk | Mitigation |
|---|---|
| Performance regression after migration | Feature flags per entity type — instant rollback to JSON |
| Neon outage | JSON fallback mode. Sync scripts check data source flag. |
| Data corruption during sync | Idempotency keys prevent duplicate writes. Version history enables rollback to any prior version. |
| Cold start latency | Keep-alive cron every 4 min during business hours |
| Tile rebuild failure | Decoupled from sync — data is still available via API even if tiles are stale |
| Complex Explorer refactor | Saved for last (Phase 2b) — all patterns proven on simpler pages first |

---

## 10. Performance Considerations

### 10.1 Connection Pooling

```typescript
// lib/db/client.ts — for API routes (serverless)
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

```typescript
// lib/db/client-pooled.ts — for sync scripts (long-running)
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const db = drizzle(pool, { schema });
```

**Note:** Use `@neondatabase/serverless` for both — the standard `pg` driver's connection pool doesn't work in Vercel Serverless Functions (no persistent processes).

### 10.2 Caching Strategy

| Layer | Strategy | Invalidation |
|---|---|---|
| **CDN (Vercel Edge)** | `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400` | On-demand via cache tags |
| **Next.js Data Cache** | Cache tags per entity type | `revalidateTag()` after sync |
| **API Response** | `Cache-Control` headers | Bust via `revalidateTag()` |
| **Search** | No cache (real-time results expected) | N/A |
| **Territory geometry** | Aggressive cache (boundaries rarely change) | `revalidateTag('territories')` |

**Cache invalidation flow:**
1. Sync script writes to API with idempotency key
2. After successful write, calls `POST /api/revalidate` with entity type tag
3. Next.js purges all cached responses tagged with that entity type
4. Next request triggers fresh fetch from database
5. Result is cached until next sync triggers revalidation

### 10.3 Index Strategy

Every query path has a corresponding index:

| Query Pattern | Index | Type |
|---|---|---|
| Lookup by slug | `idx_*_slug` | B-tree (unique) |
| Filter by segment/status/type | `idx_*_segment` | B-tree |
| Filter by FK (ISO, RTO, BA) | `idx_*_iso_id` | B-tree |
| Full-text search | `idx_*_search` | GIN (tsvector) |
| Fuzzy name search | `idx_*_name_trgm` | GIN (pg_trgm) |
| Spatial containment | `idx_*_geography` | GiST (geography) |
| Spatial nearest-neighbor | `idx_*_geography_nd` | SP-GiST (geography) |
| Spatial bbox (tile export) | `idx_*_geometry` | GiST (geometry) |
| Simplified containment | `idx_territories_simplified_1km` | GiST |
| Version history | `idx_ev_entity` | B-tree (composite) |
| JSONB arrays | `idx_programs_asset_types` | GIN |

### 10.4 Query Performance Expectations

| Query | Expected Performance |
|---|---|
| Utility list (paginated, no filters) | <5 ms |
| Utility list (filtered by segment + state) | <10 ms |
| Utility by slug | <2 ms |
| Full-text search across all entities | <50 ms |
| Point-in-polygon (which utility? — with bbox pre-filter + ST_Covers) | <10 ms |
| Nearest 10 power plants (SPGIST NN) | <10 ms |
| EV stations in bounding box | <15 ms |
| Version history for an entity (delta reconstruction) | <10 ms |

### 10.5 Large Dataset Handling

For EV stations (85K) and transmission lines (52K), API responses are always paginated (default 50, max 200). For map display, tile layers (PMTiles) show all records — the API handles list/detail/search only.

---

## 11. Observability

### 11.1 Error Tracking + Request IDs

```typescript
import * as Sentry from "@sentry/nextjs";

export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const requestId = ctx.requestId;
    try {
      return await handler(req, ctx);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { apiRoute: req.url, method: req.method, requestId },
        extra: { query: Object.fromEntries(new URL(req.url).searchParams) },
      });
      return Response.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "An unexpected error occurred",
            request_id: requestId,
            timestamp: new Date().toISOString(),
          },
        },
        { status: 500 }
      );
    }
  };
}
```

### 11.2 API Response Time Monitoring

```typescript
export function withTiming(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const start = performance.now();
    const response = await handler(req, ctx);
    const duration = performance.now() - start;

    response.headers.set("X-Response-Time", `${duration.toFixed(1)}ms`);
    response.headers.set("X-Request-Id", ctx.requestId);

    // Log slow queries
    if (duration > 200) {
      console.warn(`Slow API response: ${req.method} ${req.url} took ${duration.toFixed(1)}ms`);
      Sentry.addBreadcrumb({
        category: "api.performance",
        message: `Slow response: ${duration.toFixed(1)}ms`,
        level: "warning",
      });
    }

    return response;
  };
}
```

### 11.3 Health Check Endpoint

```typescript
// app/api/health/route.ts
export async function GET() {
  const start = Date.now();

  try {
    await db.execute(sql`SELECT 1`);
    const dbLatency = Date.now() - start;

    const lastSync = await getLastSyncStatus();
    const syncStale = Date.now() - new Date(lastSync.timestamp).getTime() > 48 * 3600 * 1000;

    return Response.json({
      status: syncStale ? "degraded" : "healthy",
      database: { latency: dbLatency, status: "ok" },
      lastSync,
    });
  } catch (err) {
    return Response.json(
      { status: "unhealthy", error: (err as Error).message },
      { status: 503 }
    );
  }
}
```

### 11.4 Sync Pipeline Health

Each sync script reports its outcome:

```typescript
await fetch(`${API_URL}/api/v1/admin/health/sync`, {
  method: "POST",
  headers: { Authorization: `Bearer ${API_KEY}` },
  body: JSON.stringify({
    source: "AFDC",
    status: "success",
    recordsProcessed: 85425,
    recordsCreated: 150,
    recordsUpdated: 320,
    durationMs: 45000,
    timestamp: new Date().toISOString(),
  }),
});
```

Dashboard endpoint:

```
GET /api/v1/admin/health/sync

{
  "data": {
    "AFDC": { "lastSync": "2026-04-14T04:00:00Z", "status": "success", "recordsProcessed": 85425 },
    "EIA-860M": { "lastSync": "2026-04-01T04:00:00Z", "status": "success", "recordsProcessed": 15082 },
    "HIFLD": { "lastSync": "2026-03-15T04:00:00Z", "status": "success", "recordsProcessed": 52244 }
  }
}
```

### 11.5 Client-Side Performance Monitoring

```typescript
// lib/analytics.ts
import { onCLS, onFCP, onFID, onLCP, onTTFB } from "web-vitals";

function sendToAnalytics(metric: any) {
  fetch("/api/vitals", {
    method: "POST",
    body: JSON.stringify(metric),
    headers: { "Content-Type": "application/json" },
  });
}

onCLS(sendToAnalytics);
onFCP(sendToAnalytics);
onFID(sendToAnalytics);
onLCP(sendToAnalytics);
onTTFB(sendToAnalytics);
```

**Target metrics:**
- **LCP:** <2.5s
- **FID:** <100ms
- **CLS:** <0.1
- **API P95 latency:** <200ms

---

## 12. Security

### 12.1 API Key Security

- **Keys are stored hashed.** SHA-256 hash of the full key. Plaintext key prefix (`cg_a1b2...`) stored separately for log identification.
- **Keys have resource:action scopes.** E.g., `utilities:read`, `utilities:write`, `admin:api-keys`, `*:read`.
- **Keys expire.** Default 1 year. Sync script keys can be set to not expire.
- **Keys can be revoked.** Setting `is_active = false` immediately disables a key.
- **Zero-downtime rotation.** Use `rotation_group` to overlap old and new keys during transition.
- **Last-used tracking.** `last_used_at` updated on each use.

```typescript
// lib/api/auth.ts
import { createHash } from "crypto";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(
  authHeader: string | null,
  resource: string,
  action: string
): Promise<{ valid: boolean; identity?: string; error?: string }> {
  if (!authHeader?.startsWith("Bearer cg_")) {
    return { valid: false, error: "Missing or invalid API key" };
  }

  const key = authHeader.replace("Bearer ", "");
  const hash = hashApiKey(key);

  const [apiKey] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)));

  if (!apiKey) return { valid: false, error: "Invalid API key" };
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, error: "API key expired" };
  }
  if (!hasScope({ scopes: apiKey.scopes, type: "api-key", identity: apiKey.name, metadata: {} }, resource, action)) {
    return { valid: false, error: `API key lacks '${resource}:${action}' scope` };
  }

  // Update last_used_at (fire-and-forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute();

  return { valid: true, identity: apiKey.name };
}
```

### 12.2 Rate Limiting via Upstash Redis

Rate limiting must be distributed (not in-memory) because Vercel Serverless Functions don't share memory across invocations:

```typescript
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

const unauthenticatedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "@commongrid/api/unauth",
});

const authenticatedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1000, "1 m"),
  prefix: "@commongrid/api/auth",
});

const writeLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "@commongrid/api/write",
});

const bulkLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "@commongrid/api/bulk",
});

export async function checkRateLimit(
  identifier: string,
  isAuthenticated: boolean,
  isWrite: boolean,
  isBulk: boolean
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const limiter = isBulk
    ? bulkLimiter
    : isWrite
      ? writeLimiter
      : isAuthenticated
        ? authenticatedLimiter
        : unauthenticatedLimiter;

  return limiter.limit(identifier);
}
```

Rate limit headers on every response:

```typescript
res.headers.set("X-RateLimit-Limit", String(limit));
res.headers.set("X-RateLimit-Remaining", String(remaining));
res.headers.set("X-RateLimit-Reset", String(reset));
```

### 12.3 Input Validation

All API inputs validated with Zod:

```typescript
import { z } from "zod";

export const utilityQuerySchema = z.object({
  search: z.string().min(2).max(200).optional(),
  segment: z.string().optional(),
  status: z.string().optional(),
  state: z.string().length(2).optional(),
  iso: z.string().optional(),
  rto: z.string().optional(),
  ba: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  fields: z.string().optional(),
  sort: z.enum(["name", "customerCount", "peakDemandMw", "totalSalesMwh"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  include: z.string().optional(),
});
```

### 12.4 CORS Configuration

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin":
    process.env.NODE_ENV === "production" ? "https://commongrid.info" : "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
```

### 12.5 Data Sensitivity

CommonGrid contains **exclusively public government data**:
- EIA filings (public record)
- HIFLD infrastructure data (public, non-classified)
- AFDC EV charging locations (public)
- ISO/RTO pricing nodes (publicly available market data)

**No PII is stored.** The `submitted_by` and `reviewed_by` fields contain system identifiers (API key names, sync script names), not personal information.

---

## 13. Expert Panel Review Summary

Three domain experts reviewed the draft specification. Their critical findings and how each was addressed:

### 13.1 Dr. Elena Vasquez — Geospatial Systems Architecture

**Key findings:**
1. **GEOMETRY type was wrong** for territories and point entities — should use GEOGRAPHY for accurate spherical calculations
2. **Missing SPGIST indexes** for nearest-neighbor queries (3-5x faster than GIST alone)
3. **No simplified geometry columns** — point-in-polygon on full-resolution territories would miss the <20ms target
4. **No bbox pre-filter** in spatial queries — scanning all 3,000 territories sequentially
5. **Tile export would OOM** on 85K EV stations (non-streaming JSON construction)
6. **Overlapping territories not handled** — `LIMIT 1` returns arbitrary utility
7. **No geometry validation** in migration script

**How addressed:**
- ✅ GEOGRAPHY is now the source of truth; GEOMETRY derived for tile export (Section 3.5)
- ✅ SPGIST indexes added for all spatial entities (Sections 3.4, 3.5)
- ✅ `simplified_1km` and `centroid` generated columns added (Section 3.5)
- ✅ All spatial queries use `bbox && point` pre-filter + `ST_Covers` (Sections 4.3, 4.5)
- ✅ Streaming batched GeoJSON export (Section 7.4)
- ✅ Overlapping territories return ranked results by segment priority (Section 4.3)
- ✅ Migration validates with ST_IsValid, ST_MakeValid, ST_SnapToGrid (Section 5.2)

### 13.2 Marcus Chen — Backend Engineering

**Key findings:**
1. **Full JSONB snapshots for version history** would cause 3 GB/year bloat
2. **Missing ON DELETE constraints** on all foreign keys
3. **No `updated_at` trigger** — timestamp stays frozen at insert time
4. **No optimistic locking** for concurrent writes
5. **Bulk API lacks idempotency** — retried syncs create duplicate versions
6. **Rate limiting in-memory doesn't work** in serverless (no shared memory)
7. **API key scopes too coarse** — `read`/`write`/`admin` doesn't support resource-level permissions
8. **Cursors unsecured** — base64 decoding allows tampering
9. **No request ID** in error responses
10. **No rollback plan** if migration goes wrong
11. **Neon cold start** unaddressed

**How addressed:**
- ✅ Delta-based versioning: full snapshot at v1, deltas for v2+ (Section 3.6)
- ✅ ON DELETE RESTRICT or SET NULL on all FKs, documented in comments (Section 3.3)
- ✅ `update_timestamp()` trigger on all entity tables (Section 3.2)
- ✅ Optimistic locking via version check on UPDATE (Section 4.3)
- ✅ Idempotency keys for bulk operations (Section 4.8)
- ✅ Rate limiting via Upstash Redis (Section 12.2)
- ✅ Resource:action scope format (Section 2.5, 3.7)
- ✅ HMAC-signed cursors (Section 4.2)
- ✅ Request ID in all error responses (Section 4.10)
- ✅ Feature flags for dual-mode operation with instant rollback (Section 5.5)
- ✅ Keep-alive cron every 4 min during business hours (Section 2.2)

### 13.3 Sarah Park — Frontend Architecture

**Key findings:**
1. **Time-based ISR (`revalidate: 3600`) is wrong** — on-demand revalidation via cache tags instead
2. **Server Actions missing** — should use for dynamic filtering, not client-side fetch
3. **Hybrid data fetching needed** — client-side for <1000 records, server-side for large datasets
4. **Map tile filtering breaks** when `getAllUtilities()` becomes async — need lightweight client-side index
5. **Migration order wrong** — should be frontend-complexity-driven, not database-table-driven
6. **No feature flags** per entity type for rollback
7. **Search UX will degrade** without optimistic UI + debouncing
8. **No sparse field projection** — map needs only slug/name, not full entity
9. **No prefetch strategy** for pagination
10. **No skeleton loading states**
11. **Landing page bundles 4.5 MB** unnecessarily — should use count-only queries
12. **Map data vs list data not decoupled** — different payloads needed

**How addressed:**
- ✅ On-demand revalidation via cache tags (Section 6.2)
- ✅ Server Actions for dynamic filtering (Section 6.3)
- ✅ Hybrid strategy: client-side for small, server-side for large (Section 6.4)
- ✅ Lightweight utility index (~150 KB) preloaded for map (Section 6.5)
- ✅ Migration order by frontend complexity: Phase 1b standalone, 1c large, 2b Explorer (Section 9)
- ✅ Feature flags per entity type with instant rollback (Section 5.5)
- ✅ Debounced search with optimistic UI (Section 6.6)
- ✅ Sparse field projection: `?fields=slug,name,segment` (Section 4.1, 4.3)
- ✅ Prefetch strategy: preload next page on hover (Section 6.7)
- ✅ Skeleton loading components (Section 6.9)
- ✅ Landing page uses count-only queries (Section 6.10)
- ✅ Map data vs list data decoupled (Section 6.8)

---

## 14. Appendix: Entity Record Counts

| Entity | Table | Records | Source JSON Size | Notes |
|---|---|---|---|---|
| ISOs | `isos` | 7 | 2.5 KB | Static import today |
| RTOs | `rtos` | 7 | 2.5 KB | Static import today |
| Balancing Authorities | `balancing_authorities` | 45 | 18 KB | Static import today |
| Regions | `regions` | 3,000 | 936 KB | Static import today |
| Utilities | `utilities` | 3,133 | 3 MB | Static import today |
| Programs | `programs` | 607 | 500 KB | Static import today |
| Power Plants | `power_plants` | 15,082 | 9 MB | Client-side fetch today |
| EV Stations | `ev_stations` | 85,425 | 40 MB | Client-side fetch today |
| Transmission Lines | `transmission_lines` | 52,244 | 20 MB | Client-side fetch today |
| Pricing Nodes | `pricing_nodes` | 4,065 | 1.3 MB | Client-side fetch today |
| Territories | `territories` | ~3,000 | ~76 MB (GeoJSON) | Individual files today |
| **Total** | | **~163,000** | **~152 MB** | |

---

*This spec incorporates critical feedback from three expert reviewers (geospatial, backend, frontend). All must-fix and should-fix items have been addressed. An engineer should be able to pick this up and start implementing Phase 1a immediately.*