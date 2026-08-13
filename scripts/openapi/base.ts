/**
 * Static portions of the OpenAPI spec that are not derived from the Drizzle
 * schema: top-level `info`, `servers`, `security`, reusable `parameters`,
 * non-resource `schemas` (ErrorResponse, PaginatedMeta, SearchResults,
 * ChangelogResponse, EntityVersion, GeoJsonFeature), and `tags`.
 *
 * Preserves the prose from the previous hand-written spec so the Developer
 * Portal experience is unchanged.
 */

import type { JsonSchema } from "./schema-from-drizzle";

export const INFO = {
  title: "CommonGrid API",
  version: "1.0.0",
  description:
    'The CommonGrid open-source energy infrastructure API. Access data on utilities, grid operators, power plants, EV charging stations, transmission lines, pricing nodes, and more.\n\n## Authentication\n\nAll endpoints are publicly accessible at the Anonymous tier (60 requests/hr). To unlock the Registered tier (5,000 requests/hr), create a free API key in the [Developer Dashboard](/developers) and include it as a Bearer token:\n\n```\nAuthorization: Bearer cg_your_api_key\n```\n\n## Rate Limits\n\n| Tier | Limit | Auth Required |\n|------|-------|---------------|\n| Anonymous | 60/hr | No |\n| Registered | 5,000/hr | API key |\n| Bulk | 50,000/hr | Contact us |\n\n## Pagination\n\nList endpoints return cursor-based pagination:\n\n```json\n{\n  "data": [...],\n  "meta": {\n    "total": 3000,\n    "limit": 50,\n    "nextCursor": "eyJ2IjoxLCJzIjp7InZhbHVlIjoiYWNtZS11dGlsaXR5In0sImlkIjoiYWJjMTIzIn0"\n  }\n}\n```\n\nPass `cursor=<nextCursor>` to fetch the next page. Use the `limit` parameter (max 200) to control page size.\n\n## Spec generation\n\nThis OpenAPI document is auto-generated from the Drizzle schema via `npm run generate:openapi`. CI verifies the committed spec is up to date on every PR; if you change a table or route and the spec diverges, `npm run check:openapi` will fail.',
  contact: {
    name: "CommonGrid Support",
    email: "hello@texturehq.com",
    url: "https://texturehq.com",
  },
  license: {
    name: "MIT",
    url: "https://github.com/TextureHQ/commongrid/blob/main/LICENSE",
  },
};

export const SERVERS = [{ url: "https://commongrid.info/api/v1", description: "Production" }];

export const SECURITY = [{ bearerAuth: [] }];

export const SECURITY_SCHEMES: Record<string, JsonSchema> = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    description: "API key obtained from the Developer Dashboard. Prefix with `cg_`.",
  },
};

export const PARAMETERS: Record<string, JsonSchema> = {
  limit: {
    name: "limit",
    in: "query",
    description: "Maximum number of results to return (1–200, default 50)",
    schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
  cursor: {
    name: "cursor",
    in: "query",
    description: "Pagination cursor from the previous response `meta.nextCursor`",
    schema: { type: "string" },
  },
  search: {
    name: "search",
    in: "query",
    description: "Full-text search query (min 2 characters)",
    schema: { type: "string", minLength: 2 },
  },
  fields: {
    name: "fields",
    in: "query",
    description: "Comma-separated list of fields to include in the response (sparse fieldsets)",
    schema: { type: "string" },
    example: "id,slug,name",
  },
  slug: {
    name: "slug",
    in: "path",
    required: true,
    description: "Unique URL-safe identifier for the resource",
    schema: { type: "string" },
  },
};

/**
 * Static (non-resource) schema components.
 * These aren't derived from Drizzle tables — they describe response
 * envelopes, error shapes, and generic GeoJSON.
 */
export const STATIC_SCHEMAS: Record<string, JsonSchema> = {
  PaginatedMeta: {
    type: "object",
    properties: {
      total: { type: "integer", description: "Total number of matching records" },
      limit: { type: "integer", description: "Page size used for this response" },
      nextCursor: {
        type: "string",
        nullable: true,
        description: "Cursor for the next page, or null if no more pages",
      },
    },
  },
  ErrorResponse: {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: {
          code: { type: "string", example: "NOT_FOUND" },
          message: { type: "string", example: "Resource not found" },
        },
      },
    },
  },
  GeoJsonFeature: {
    type: "object",
    description: "A GeoJSON Feature (RFC 7946)",
    properties: {
      type: { type: "string", enum: ["Feature"] },
      geometry: { type: "object", description: "GeoJSON geometry object" },
      properties: { type: "object", description: "Arbitrary feature properties" },
    },
  },
  EntityVersion: {
    type: "object",
    description: "A single entry in an entity's version history (from `entity_versions`).",
    properties: {
      id: { type: "integer" },
      versionNumber: { type: "integer" },
      changeType: { type: "string", description: "One of: create, update, delete" },
      changeSummary: { type: "string", nullable: true },
      changedBy: { type: "string", nullable: true },
      changedAt: { type: "string", format: "date-time" },
      delta: {
        type: "object",
        nullable: true,
        description: "Field-level delta: { <fieldName>: { old, new } }",
        additionalProperties: true,
      },
    },
  },
  ChangelogEntry: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["added", "updated"] },
      entityType: { type: "string" },
      entityTypeLabel: { type: "string" },
      name: { type: "string" },
      slug: { type: "string" },
      detail: { type: "string" },
      isoTimestamp: { type: "string", format: "date-time" },
    },
  },
  ChangelogResponse: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: { $ref: "#/components/schemas/ChangelogEntry" },
      },
      total: { type: "integer" },
      hasMore: { type: "boolean" },
      source: { type: "string", enum: ["static", "database"] },
    },
  },
  ResolveUtilityRequest: {
    type: "object",
    required: ["name"],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description: "Free-form utility name. May also be a string containing '@domain' to trigger domain matching.",
        example: "Vermont Electric Cooperative",
      },
      state: {
        type: "string",
        pattern: "^[A-Za-z]{2}$",
        description: "Optional two-letter US state code. Narrows candidates to utilities in that state.",
        example: "VT",
      },
      domain: {
        type: "string",
        maxLength: 253,
        description:
          "Optional email/web domain (e.g. 'duke-energy.com'). Combined with name when name does not already contain '@'.",
        example: "vermontelectric.coop",
      },
      confidence_threshold: {
        type: "number",
        minimum: 0,
        maximum: 1,
        default: 0.85,
        description:
          "Minimum trigram similarity (0..1) required to return a fuzzy match as the resolved utility. Defaults to 0.85.",
      },
    },
    additionalProperties: false,
  },
  ResolveUtilityCandidate: {
    type: "object",
    properties: {
      eia_id: { type: "string", description: "EIA utility id." },
      name: { type: "string", description: "Canonical utility name." },
      score: { type: "number", description: "Match score, 0..1." },
      segment: { type: "string", nullable: true, description: "Utility segment (e.g. distribution)." },
      state: { type: "string", nullable: true, description: "Two-letter state code." },
    },
  },
  ResolveUtilityResponse: {
    type: "object",
    properties: {
      eia_id: {
        type: "string",
        nullable: true,
        description: "Resolved EIA utility id, or null when no match met the confidence threshold.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence of the resolved match, 0..1.",
      },
      match_source: {
        type: "string",
        enum: ["exact", "fuzzy", "alias", "domain", "override", "none"],
        description: "Which resolver phase produced the match.",
      },
      canonical_name: {
        type: "string",
        nullable: true,
        description: "Canonical utility name for the resolved id, when a match was found.",
      },
      candidates: {
        type: "array",
        items: { $ref: "#/components/schemas/ResolveUtilityCandidate" },
        description:
          "Up to 5 candidates considered, ordered by score desc. Populated even when no candidate met the threshold.",
      },
      resolver_version: {
        type: "string",
        description: "Semantic version of the resolver algorithm. Clients can pin this to detect algorithm changes.",
      },
    },
  },
  UtilityGeometryFeatureCollection: {
    type: "object",
    description:
      "GeoJSON FeatureCollection returned by `/utilities/{slug}/geometry`. Always 200 when the utility exists; `metadata.geometry_status` tells the caller whether the polygon is loaded or still pending backfill.",
    required: ["type", "features", "metadata"],
    properties: {
      type: { type: "string", enum: ["FeatureCollection"] },
      features: {
        type: "array",
        description:
          "Zero or one `Feature<MultiPolygon>`. Empty when `metadata.geometry_status` is `pending_backfill`; contains one feature when `loaded`.",
        items: {
          type: "object",
          required: ["type", "geometry", "properties"],
          properties: {
            type: { type: "string", enum: ["Feature"] },
            geometry: {
              type: "object",
              description: "GeoJSON MultiPolygon geometry.",
              required: ["type", "coordinates"],
              properties: {
                type: { type: "string", enum: ["MultiPolygon"] },
                coordinates: {
                  type: "array",
                  items: {
                    type: "array",
                    items: {
                      type: "array",
                      items: {
                        type: "array",
                        items: { type: "number" },
                        minItems: 2,
                      },
                    },
                  },
                },
              },
            },
            properties: {
              type: "object",
              properties: {
                utility_slug: { type: "string" },
                utility_name: { type: "string" },
                eia_id: { type: "string" },
                region_slug: { type: "string", nullable: true },
                territory_id: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      metadata: {
        type: "object",
        required: ["utility_slug", "eia_id", "geometry_status"],
        properties: {
          utility_slug: { type: "string" },
          utility_name: { type: "string" },
          eia_id: { type: "string" },
          region_slug: { type: "string", nullable: true },
          territory_id: { type: "string", nullable: true },
          geometry_status: {
            type: "string",
            enum: ["loaded", "pending_backfill"],
            description:
              "`loaded` when the territory polygon is available; `pending_backfill` when the utility exists in the registry but its polygon has not been ingested yet (known data gap).",
          },
          source: {
            type: "string",
            nullable: true,
            description:
              "Data source for the polygon (e.g. `HIFLD`, `EIA-861`). `null` when `geometry_status` is `pending_backfill`.",
          },
          source_url: { type: "string", nullable: true },
          area_sq_km: { type: "number", nullable: true },
          updated_at: {
            type: "string",
            format: "date-time",
            nullable: true,
            description: "When the territory row was last updated. Present on `loaded` responses.",
          },
        },
      },
    },
  },
  UtilityNotFoundError: {
    type: "object",
    description: "Flat 404 shape returned when a utility slug is not in the registry.",
    required: ["error", "slug"],
    properties: {
      error: { type: "string", enum: ["utility_not_found"] },
      slug: { type: "string" },
    },
  },
  TileJson: {
    type: "object",
    description:
      "TileJSON 3.0.0 document describing a single vector tileset. Pass the document URL straight to a Mapbox GL JS / MapLibre GL JS vector source `url` and the client configures itself.",
    required: ["tilejson", "name", "tiles", "minzoom", "maxzoom", "vector_layers"],
    properties: {
      tilejson: { type: "string", enum: ["3.0.0"] },
      name: { type: "string", example: "CommonGrid Power Plants" },
      description: { type: "string" },
      attribution: {
        type: "string",
        description: "HTML attribution string crediting CommonGrid and the upstream data source.",
      },
      scheme: { type: "string", enum: ["xyz"] },
      tiles: {
        type: "array",
        description: "Absolute XYZ tile URL templates containing {z}/{x}/{y}.",
        items: { type: "string" },
      },
      minzoom: { type: "integer", minimum: 0, example: 0 },
      maxzoom: {
        type: "integer",
        description:
          "Highest zoom with distinct data. Requests above this are served the highest-zoom ancestor tile for client-side overzooming.",
        example: 12,
      },
      bounds: {
        type: "array",
        description: "[minLon, minLat, maxLon, maxLat] covering the tileset extent.",
        items: { type: "number" },
        minItems: 4,
        maxItems: 4,
      },
      center: {
        type: "array",
        description: "[lon, lat, zoom] suggested default view.",
        items: { type: "number" },
        minItems: 3,
        maxItems: 3,
      },
      vector_layers: {
        type: "array",
        description:
          "MVT layers inside the tileset. Use `id` as the style `source-layer`, and take attribute names from `fields` — they do not always match the JSON API field names (power-plant tiles emit `capacityMw`, the JSON API returns `totalCapacityMw`).",
        items: {
          type: "object",
          required: ["id", "fields"],
          properties: {
            id: { type: "string" },
            fields: { type: "object", additionalProperties: { type: "string" } },
            minzoom: { type: "integer" },
            maxzoom: { type: "integer" },
          },
        },
      },
    },
  },
  TileLayerIndex: {
    type: "object",
    description: "Index of every vector tile layer CommonGrid publishes.",
    properties: {
      tilejson_version: { type: "string", example: "3.0.0" },
      attribution: { type: "string" },
      layers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", example: "power-plants" },
            name: { type: "string" },
            description: { type: "string" },
            attribution: { type: "string" },
            tilejson: {
              type: "string",
              description: "URL of this layer's TileJSON document.",
              example: "https://commongrid.info/api/tiles/power-plants.json",
            },
            tiles: { type: "array", items: { type: "string" } },
            minzoom: { type: "integer" },
            maxzoom: { type: "integer" },
            bounds: { type: "array", items: { type: "number" } },
            sourceLayers: {
              type: "array",
              description: "MVT source-layer names available in this tileset.",
              items: { type: "string" },
            },
          },
        },
      },
    },
  },
  SearchResults: {
    type: "object",
    description: "Grouped search results keyed by entity type (camelCase plural).",
    properties: {
      data: {
        type: "object",
        additionalProperties: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              slug: { type: "string" },
              name: { type: "string" },
              type: { type: "string" },
            },
          },
        },
      },
      meta: {
        type: "object",
        properties: {
          total: { type: "integer" },
          source: { type: "string" },
        },
      },
    },
  },
};

export const TAGS = [
  { name: "Utilities", description: "Electric, gas, and water utilities" },
  { name: "Grid Operators", description: "ISOs, RTOs, and Balancing Authorities" },
  { name: "Regions", description: "Geographic regions (states, counties, territories)" },
  { name: "Territories", description: "Utility and grid-operator service-territory geometry" },
  { name: "Power Plants", description: "Power generation facilities (EIA-860)" },
  { name: "Substations", description: "Substations from EIA + OSM" },
  { name: "Transmission Lines", description: "Transmission line metadata (HIFLD)" },
  { name: "EV Stations", description: "EV charging stations (DOE AFDC)" },
  { name: "Pricing Nodes", description: "Wholesale electricity pricing nodes and hubs" },
  { name: "Programs", description: "Utility programs and incentives" },
  { name: "Search", description: "Cross-entity full-text search" },
  { name: "Changelog", description: "Cross-entity change feed" },
  { name: "Vector Tiles", description: "TileJSON metadata for the published vector tile layers" },
];
