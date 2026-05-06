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
];
