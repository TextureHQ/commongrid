/**
 * Endpoint registry — one entry per HTTP path documented in the public
 * OpenAPI spec. Each entry describes:
 *   - the URL pattern (`path`) and HTTP verb (always GET for now);
 *   - the response shape (list / single / geojson / custom);
 *   - the OpenAPI tag it belongs to;
 *   - the list of query parameters mirrored from the real route file.
 *
 * Keep this file in sync with `app/api/v1/**` route handlers. The generator
 * consumes this registry and emits `paths.<path>.<method>` entries in the
 * spec.
 *
 * Intentionally excluded (auth-required / internal):
 *   - mod/*, developer/*, contributions, discussions, follows, notifications,
 *     me, editable-fields, webhooks, revalidate, health, tiles.
 */

import type { JsonSchema } from "./schema-from-drizzle";

export interface ParamDef {
  /** camelCase or lower-kebab name exactly as the handler reads it */
  name: string;
  in: "query" | "path";
  description?: string;
  /** Pass a JSON-schema snippet verbatim */
  schema: JsonSchema;
  required?: boolean;
  example?: string | number | boolean;
}

export type ResponseShape =
  | { kind: "list"; itemSchemaRef: string }
  | { kind: "single"; schemaRef: string }
  | { kind: "singleInData"; schemaRef: string }
  | { kind: "geojson" }
  | { kind: "raw"; schema: JsonSchema };

/** OpenAPI request body definition for POST/PUT/PATCH routes. */
export interface RequestBodyDef {
  description?: string;
  required?: boolean;
  /** JSON-schema body (use $ref or inline). */
  schema: JsonSchema;
  /** Optional example payload rendered next to the schema. */
  example?: unknown;
}

export interface EndpointDef {
  path: string;
  method: "get" | "post";
  operationId: string;
  summary: string;
  description?: string;
  tag: string;
  parameters?: ParamDef[];
  /** Request body (POST only). */
  requestBody?: RequestBodyDef;
  /** Response shape for the 2xx reply. */
  response: ResponseShape;
  /** Include a 404 response entry. Defaults to true for `{slug}` endpoints. */
  has404?: boolean;
  /** Include a 400 response entry (validation errors). Defaults to true for POST. */
  has400?: boolean;
}

// ---------------------------------------------------------------------------
// Shared query parameters referenced via OpenAPI parameter refs.
// ---------------------------------------------------------------------------

export const LIMIT_REF = { $ref: "#/components/parameters/limit" };
export const CURSOR_REF = { $ref: "#/components/parameters/cursor" };
export const SLUG_REF = { $ref: "#/components/parameters/slug" };
export const FIELDS_REF = { $ref: "#/components/parameters/fields" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STRING: JsonSchema = { type: "string" };
const INTEGER: JsonSchema = { type: "integer" };
const NUMBER: JsonSchema = { type: "number" };
const BOOLEAN_STR: JsonSchema = { type: "string", enum: ["true", "false"] };

const SORT_ORDER: JsonSchema = { type: "string", enum: ["asc", "desc"], default: "asc" };

// ---------------------------------------------------------------------------
// Endpoint definitions (order shapes the Redocly sidebar)
// ---------------------------------------------------------------------------

export const ENDPOINTS: EndpointDef[] = [
  // -----------------------
  // Utilities
  // -----------------------
  {
    path: "/utilities",
    method: "get",
    operationId: "listUtilities",
    summary: "List utilities",
    description: "Returns a paginated list of US utilities with filtering and sorting.",
    tag: "Utilities",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      FIELDS_REF,
      {
        name: "segment",
        in: "query",
        description: "Filter by segment (electric, gas, water, combined)",
        schema: STRING,
      },
      { name: "status", in: "query", description: "Filter by operational status", schema: STRING },
      { name: "state", in: "query", description: "Filter by two-letter US state code", schema: STRING },
      { name: "iso", in: "query", description: "Filter by ISO id", schema: STRING },
      { name: "rto", in: "query", description: "Filter by RTO id", schema: STRING },
      { name: "ba", in: "query", description: "Filter by balancing authority id", schema: STRING },
      {
        name: "search",
        in: "query",
        description: "Full-text search over name/eiaName/shortName/jurisdiction (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "hasGeneration",
        in: "query",
        description: "Filter utilities that own generation assets",
        schema: BOOLEAN_STR,
      },
      {
        name: "hasTransmission",
        in: "query",
        description: "Filter utilities that own transmission assets",
        schema: BOOLEAN_STR,
      },
      {
        name: "hasDistribution",
        in: "query",
        description: "Filter utilities that own distribution assets",
        schema: BOOLEAN_STR,
      },
      {
        name: "lat",
        in: "query",
        description: "Latitude for point-in-polygon service-territory lookup (pair with lng)",
        schema: NUMBER,
      },
      {
        name: "lng",
        in: "query",
        description: "Longitude for point-in-polygon service-territory lookup (pair with lat)",
        schema: NUMBER,
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field (slug, name, customerCount, segment)",
        schema: { type: "string", enum: ["slug", "name", "customerCount", "segment"], default: "slug" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
      {
        name: "include",
        in: "query",
        description: "Comma-separated related entities to embed (iso,rto,ba)",
        schema: STRING,
      },
    ],
    response: { kind: "list", itemSchemaRef: "Utility" },
  },
  {
    path: "/utilities/{slug}",
    method: "get",
    operationId: "getUtility",
    summary: "Get utility by slug",
    tag: "Utilities",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "Utility" },
  },
  {
    path: "/utilities/{slug}/geometry",
    method: "get",
    operationId: "getUtilityGeometry",
    summary: "Get utility service-territory geometry (GeoJSON FeatureCollection)",
    description:
      'Resolves a utility slug to its service-territory polygon and returns a GeoJSON `FeatureCollection` with a `metadata` block describing the resolved utility and `geometry_status`. Resolution follows utilities \u2192 regions (`SERVICE_TERRITORY`) \u2192 territories internally, so consumers only need the utility slug. Returns `200` with `features: []` and `metadata.geometry_status: "pending_backfill"` for utilities whose territory polygon has not been ingested yet (a known data gap that the backfill pipeline resolves over time) and `200` with one `Feature<MultiPolygon>` and `metadata.geometry_status: "loaded"` when geometry is available. Returns `404 { error: "utility_not_found", slug }` only when the slug is not in the registry. Responses are served as `application/geo+json` with cache headers that differentiate loaded (1h) from pending (5m).',
    tag: "Utilities",
    parameters: [
      SLUG_REF,
      {
        name: "simplify",
        in: "query",
        description: "Topology-preserving simplification tolerance in degrees (default 0.01, higher = simpler).",
        schema: NUMBER,
      },
    ],
    response: { kind: "raw", schema: { $ref: "#/components/schemas/UtilityGeometryFeatureCollection" } },
    has404: true,
  },
  {
    path: "/utilities/resolve",
    method: "post",
    operationId: "resolveUtility",
    summary: "Resolve a utility name to an EIA id",
    description:
      "Resolves a free-form utility name (optionally scoped by state or an email domain) to a canonical EIA utility id. Useful for researchers, journalists, and anyone joining an external dataset (news articles, complaint databases, email sign-ups) against the utility registry. Cascades through a manual override table, an exact normalized-name match, a domain match when the input looks like an email, and a trigram fuzzy match. Returns the resolved id plus the top 5 candidates considered.",
    tag: "Utilities",
    requestBody: {
      description: "Resolution query.",
      required: true,
      schema: { $ref: "#/components/schemas/ResolveUtilityRequest" },
      example: {
        name: "Vermont Electric Cooperative",
        state: "VT",
      },
    },
    response: { kind: "raw", schema: { $ref: "#/components/schemas/ResolveUtilityResponse" } },
    has404: false,
  },
  {
    path: "/utilities/deprecated",
    method: "get",
    operationId: "listDeprecatedUtilities",
    summary: "List utilities with deprecated EIA ids",
    description:
      "Returns utilities whose EIA id has been deprecated — merged into a successor, acquired by another utility, or dissolved/retired. Useful for journalists tracking utility consolidation, researchers joining historical datasets whose rows key on an EIA id, and integrators polling `?since=<last_sync_at>` to keep a cache of CommonGrid keys fresh. A utility is considered deprecated when its status is MERGED, ACQUIRED, or DEFUNCT. The response's `deprecated_at` field is the precise deprecation timestamp when known, falling back to the row's `updated_at` for historical rows that predate the dedicated column.",
    tag: "Utilities",
    parameters: [
      {
        name: "since",
        in: "query",
        description:
          "ISO 8601 timestamp. Only include utilities whose effective deprecation timestamp is strictly after this value.",
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "state",
        in: "query",
        description: "Two-letter US state/jurisdiction code. Case-insensitive.",
        schema: { type: "string", pattern: "^[A-Za-z]{2}$" },
      },
      {
        name: "limit",
        in: "query",
        description: "Page size. Defaults to 100, maximum 500.",
        schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      },
      {
        name: "offset",
        in: "query",
        description: "Row offset for pagination. Defaults to 0.",
        schema: { type: "integer", minimum: 0, default: 0 },
      },
    ],
    response: { kind: "raw", schema: { $ref: "#/components/schemas/DeprecatedUtilitiesResponse" } },
    has404: false,
  },

  // -----------------------
  // ISOs
  // -----------------------
  {
    path: "/isos",
    method: "get",
    operationId: "listIsos",
    summary: "List ISOs",
    description: "Independent System Operators that manage wholesale electricity markets.",
    tag: "Grid Operators",
    parameters: [LIMIT_REF, CURSOR_REF],
    response: { kind: "list", itemSchemaRef: "Iso" },
  },
  {
    path: "/isos/{slug}",
    method: "get",
    operationId: "getIso",
    summary: "Get ISO by slug",
    tag: "Grid Operators",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "Iso" },
  },
  {
    path: "/isos/{slug}/geometry",
    method: "get",
    operationId: "getIsoGeometry",
    summary: "Get ISO boundary geometry",
    description: "Returns GeoJSON boundary geometry for the ISO.",
    tag: "Grid Operators",
    parameters: [SLUG_REF],
    response: { kind: "geojson" },
  },

  // -----------------------
  // RTOs
  // -----------------------
  {
    path: "/rtos",
    method: "get",
    operationId: "listRtos",
    summary: "List RTOs",
    description: "Regional Transmission Organizations that coordinate wholesale transmission.",
    tag: "Grid Operators",
    parameters: [LIMIT_REF, CURSOR_REF],
    response: { kind: "list", itemSchemaRef: "Rto" },
  },
  {
    path: "/rtos/{slug}",
    method: "get",
    operationId: "getRto",
    summary: "Get RTO by slug",
    tag: "Grid Operators",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "Rto" },
  },
  {
    path: "/rtos/{slug}/geometry",
    method: "get",
    operationId: "getRtoGeometry",
    summary: "Get RTO boundary geometry",
    description: "Returns GeoJSON boundary geometry for the RTO.",
    tag: "Grid Operators",
    parameters: [SLUG_REF],
    response: { kind: "geojson" },
  },

  // -----------------------
  // Balancing Authorities
  // -----------------------
  {
    path: "/balancing-authorities",
    method: "get",
    operationId: "listBalancingAuthorities",
    summary: "List balancing authorities",
    description: "Balancing authorities that balance electricity supply and demand in real time.",
    tag: "Grid Operators",
    parameters: [LIMIT_REF, CURSOR_REF],
    response: { kind: "list", itemSchemaRef: "BalancingAuthority" },
  },
  {
    path: "/balancing-authorities/{slug}",
    method: "get",
    operationId: "getBalancingAuthority",
    summary: "Get balancing authority by slug",
    tag: "Grid Operators",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "BalancingAuthority" },
  },
  {
    path: "/balancing-authorities/{slug}/geometry",
    method: "get",
    operationId: "getBalancingAuthorityGeometry",
    summary: "Get balancing authority boundary geometry",
    description: "Returns GeoJSON boundary geometry for the balancing authority.",
    tag: "Grid Operators",
    parameters: [SLUG_REF],
    response: { kind: "geojson" },
  },

  // -----------------------
  // Regions
  // -----------------------
  {
    path: "/regions",
    method: "get",
    operationId: "listRegions",
    summary: "List regions",
    description: "Geographic regions (states, counties, ISO/RTO territories, utility service territories, CCAs).",
    tag: "Regions",
    parameters: [LIMIT_REF, CURSOR_REF],
    response: { kind: "list", itemSchemaRef: "Region" },
  },
  {
    path: "/regions/{slug}",
    method: "get",
    operationId: "getRegion",
    summary: "Get region by slug",
    tag: "Regions",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "Region" },
  },

  // -----------------------
  // Territories
  // -----------------------
  {
    path: "/territories",
    method: "get",
    operationId: "listTerritories",
    summary: "List territories",
    description: "Territory metadata for regions. Geometry is served via `/territories/{slug}/geometry`.",
    tag: "Territories",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      { name: "state", in: "query", description: "Filter by two-letter US state code", schema: STRING },
      { name: "type", in: "query", description: "Filter by region type", schema: STRING },
      {
        name: "utilityId",
        in: "query",
        description: "Filter to the service territory of a specific utility",
        schema: STRING,
      },
      {
        name: "search",
        in: "query",
        description: "Fuzzy name match (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field (slug, name, state, type)",
        schema: { type: "string", enum: ["slug", "name", "state", "type"], default: "slug" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
    ],
    response: { kind: "list", itemSchemaRef: "Territory" },
  },
  {
    path: "/territories/{slug}",
    method: "get",
    operationId: "getTerritory",
    summary: "Get territory metadata by slug",
    tag: "Territories",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "Territory" },
  },
  {
    path: "/territories/{slug}/geometry",
    method: "get",
    operationId: "getTerritoryGeometry",
    summary: "Get territory geometry (GeoJSON)",
    description:
      "Returns the territory's MultiPolygon geometry as GeoJSON. The `{slug}` path parameter accepts either the internal territory row id (e.g. `territory-7601`) or the human-friendly region slug (e.g. `st-green-mountain-power-corp-7601`) — the latter is the form documented elsewhere in the API. Use `?simplify=0.01` to apply topology-preserving simplification.",
    tag: "Territories",
    parameters: [
      SLUG_REF,
      {
        name: "simplify",
        in: "query",
        description: "Simplification tolerance in degrees (higher = simpler)",
        schema: NUMBER,
      },
    ],
    response: { kind: "geojson" },
  },
  {
    path: "/territories/lookup",
    method: "get",
    operationId: "lookupTerritoriesByPoint",
    summary: "Point-in-polygon territory lookup",
    description:
      "Returns every territory whose geometry contains the supplied lat/lng point (up to 10, ordered by region type).",
    tag: "Territories",
    parameters: [
      {
        name: "lat",
        in: "query",
        required: true,
        description: "Latitude in degrees (-90..90)",
        schema: NUMBER,
        example: 40.7128,
      },
      {
        name: "lng",
        in: "query",
        required: true,
        description: "Longitude in degrees (-180..180)",
        schema: NUMBER,
        example: -74.006,
      },
    ],
    response: {
      kind: "raw",
      schema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                type: { type: "string" },
                state: { type: "string", nullable: true },
                slug: { type: "string" },
              },
            },
          },
        },
      },
    },
    has404: false,
  },

  // -----------------------
  // Power Plants
  // -----------------------
  {
    path: "/power-plants",
    method: "get",
    operationId: "listPowerPlants",
    summary: "List power plants",
    description: "EIA-860 power generation facilities.",
    tag: "Power Plants",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      FIELDS_REF,
      { name: "state", in: "query", description: "Filter by two-letter US state code", schema: STRING },
      { name: "fuelCategory", in: "query", description: "Filter by normalized fuel category", schema: STRING },
      { name: "status", in: "query", description: "Filter by status (operable, proposed)", schema: STRING },
      { name: "utilityId", in: "query", description: "Filter by operating utility id", schema: STRING },
      { name: "baId", in: "query", description: "Filter by balancing authority id", schema: STRING },
      {
        name: "search",
        in: "query",
        description: "Name/utility/county search (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field",
        schema: { type: "string", enum: ["name", "totalCapacityMw", "state"], default: "name" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
    ],
    response: { kind: "list", itemSchemaRef: "PowerPlant" },
  },
  {
    path: "/power-plants/{slug}",
    method: "get",
    operationId: "getPowerPlant",
    summary: "Get power plant by slug",
    tag: "Power Plants",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "PowerPlant" },
  },
  {
    path: "/power-plants/{slug}/substations",
    method: "get",
    operationId: "getPowerPlantSubstations",
    summary: "List substations connected to a power plant",
    description:
      "Returns interconnected substations from the `power_plant_interconnections` join table, ordered by primary-flag then distance.",
    tag: "Power Plants",
    parameters: [SLUG_REF],
    response: {
      kind: "raw",
      schema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                substationId: { type: "string" },
                substationName: { type: "string" },
                substationType: { type: "string" },
                voltageClass: { type: "string" },
                owner: { type: "string", nullable: true },
                distanceKm: { type: "number" },
                isPrimary: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },

  // -----------------------
  // Substations
  // -----------------------
  {
    path: "/substations",
    method: "get",
    operationId: "listSubstations",
    summary: "List substations",
    description: "US substations from EIA and OpenStreetMap (ODbL attribution).",
    tag: "Substations",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      FIELDS_REF,
      { name: "state", in: "query", description: "Filter by two-letter US state code", schema: STRING },
      {
        name: "substationType",
        in: "query",
        description: "Filter by substation type",
        schema: { type: "string", enum: ["transmission", "distribution", "hybrid", "unknown"] },
      },
      {
        name: "status",
        in: "query",
        description: "Filter by status",
        schema: { type: "string", enum: ["in_service", "out_of_service", "planned", "retired", "unknown"] },
      },
      {
        name: "source",
        in: "query",
        description: "Filter by upstream source",
        schema: { type: "string", enum: ["eia", "osm", "manual", "hybrid"] },
      },
      { name: "ownerUtilityId", in: "query", description: "Filter by owning utility id", schema: STRING },
      { name: "minMaxVoltageKv", in: "query", description: "Minimum `maxVoltageKv` to include", schema: INTEGER },
      {
        name: "search",
        in: "query",
        description: "Name/owner/county search (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field",
        schema: { type: "string", enum: ["name", "state", "maxVoltageKv"], default: "name" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
    ],
    response: { kind: "list", itemSchemaRef: "Substation" },
  },
  {
    path: "/substations/{slug}",
    method: "get",
    operationId: "getSubstation",
    summary: "Get substation by slug",
    tag: "Substations",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "Substation" },
  },
  {
    path: "/substations/{slug}/transmission-lines",
    method: "get",
    operationId: "getSubstationTransmissionLines",
    summary: "List transmission lines connected to a substation",
    description: "Returns connected transmission lines from the `transmission_line_endpoints` join table.",
    tag: "Substations",
    parameters: [SLUG_REF],
    response: {
      kind: "raw",
      schema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                lineId: { type: "string" },
                lineName: { type: "string", nullable: true },
                lineVoltageClass: { type: "string" },
                lineVoltage: { type: "number", nullable: true },
                lineStatus: { type: "string" },
                lineOwner: { type: "string", nullable: true },
                role: { type: "string", enum: ["from", "to"] },
                matchConfidence: { type: "number", nullable: true },
              },
            },
          },
        },
      },
    },
  },

  // -----------------------
  // Transmission Lines
  // -----------------------
  {
    path: "/transmission-lines",
    method: "get",
    operationId: "listTransmissionLines",
    summary: "List transmission lines",
    description: "HIFLD transmission line metadata. Line geometries are served via PMTiles, not this endpoint.",
    tag: "Transmission Lines",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      FIELDS_REF,
      { name: "voltageClass", in: "query", description: "Filter by normalized voltage class", schema: STRING },
      { name: "owner", in: "query", description: "Filter by owner name (exact match)", schema: STRING },
      { name: "status", in: "query", description: "Filter by status", schema: STRING },
      {
        name: "search",
        in: "query",
        description: "Owner search (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field",
        schema: { type: "string", enum: ["owner", "voltageClass", "lengthMiles"], default: "owner" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
    ],
    response: { kind: "list", itemSchemaRef: "TransmissionLine" },
  },
  {
    path: "/transmission-lines/{id}",
    method: "get",
    operationId: "getTransmissionLine",
    summary: "Get transmission line by id",
    tag: "Transmission Lines",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "Internal transmission line id",
        schema: { type: "string" },
      },
    ],
    response: { kind: "singleInData", schemaRef: "TransmissionLine" },
  },

  // -----------------------
  // EV Stations
  // -----------------------
  {
    path: "/ev-stations",
    method: "get",
    operationId: "listEvStations",
    summary: "List EV charging stations",
    description: "Public and private EV charging stations from the DOE AFDC dataset.",
    tag: "EV Stations",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      FIELDS_REF,
      { name: "state", in: "query", description: "Filter by two-letter US state code", schema: STRING },
      { name: "city", in: "query", description: "Filter by city", schema: STRING },
      { name: "network", in: "query", description: "Filter by EV network (exact match)", schema: STRING },
      { name: "accessCode", in: "query", description: "Filter by access code", schema: STRING },
      { name: "statusCode", in: "query", description: "Filter by status code", schema: STRING },
      {
        name: "search",
        in: "query",
        description: "Station name/address/city search (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field",
        schema: { type: "string", enum: ["stationName", "city", "state"], default: "stationName" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
    ],
    response: { kind: "list", itemSchemaRef: "EvStation" },
  },
  {
    path: "/ev-stations/{slug}",
    method: "get",
    operationId: "getEvStation",
    summary: "Get EV station by slug",
    tag: "EV Stations",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "EvStation" },
  },

  // -----------------------
  // Pricing Nodes
  // -----------------------
  {
    path: "/pricing-nodes",
    method: "get",
    operationId: "listPricingNodes",
    summary: "List pricing nodes",
    description: "Wholesale electricity pricing nodes across all 7 US ISOs/RTOs.",
    tag: "Pricing Nodes",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      FIELDS_REF,
      {
        name: "iso",
        in: "query",
        description: "Filter by ISO (CAISO, PJM, ERCOT, MISO, NYISO, ISONE, SPP)",
        schema: STRING,
      },
      { name: "nodeType", in: "query", description: "Filter by pricing node type", schema: STRING },
      { name: "state", in: "query", description: "Filter by two-letter US state code", schema: STRING },
      {
        name: "search",
        in: "query",
        description: "Name/zone search (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field",
        schema: { type: "string", enum: ["name", "iso", "nodeType"], default: "name" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
    ],
    response: { kind: "list", itemSchemaRef: "PricingNode" },
  },
  {
    path: "/pricing-nodes/{slug}",
    method: "get",
    operationId: "getPricingNode",
    summary: "Get pricing node by slug",
    tag: "Pricing Nodes",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "PricingNode" },
  },
  {
    path: "/pricing-nodes/{slug}/versions",
    method: "get",
    operationId: "getPricingNodeVersions",
    summary: "Get pricing node version history",
    description: "Returns every version of the pricing node from the `entity_versions` audit table.",
    tag: "Pricing Nodes",
    parameters: [SLUG_REF],
    response: {
      kind: "raw",
      schema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/EntityVersion" },
          },
        },
      },
    },
  },

  // -----------------------
  // Programs
  // -----------------------
  {
    path: "/programs",
    method: "get",
    operationId: "listPrograms",
    summary: "List programs",
    description:
      "Utility programs and incentives — demand response, virtual power plants, DER aggregation, rebates, etc.",
    tag: "Programs",
    parameters: [
      LIMIT_REF,
      CURSOR_REF,
      FIELDS_REF,
      { name: "status", in: "query", description: "Filter by program status", schema: STRING },
      {
        name: "assetType",
        in: "query",
        description: "Filter by asset type (matches any element in program's `assetTypes` array)",
        schema: STRING,
      },
      { name: "marketSegment", in: "query", description: "Filter by market segment", schema: STRING },
      { name: "gridService", in: "query", description: "Filter by grid service", schema: STRING },
      {
        name: "search",
        in: "query",
        description: "Name/description search (min 2 chars)",
        schema: { type: "string", minLength: 2 },
      },
      {
        name: "sort",
        in: "query",
        description: "Sort field",
        schema: { type: "string", enum: ["name", "status"], default: "name" },
      },
      { name: "order", in: "query", description: "Sort order", schema: SORT_ORDER },
    ],
    response: { kind: "list", itemSchemaRef: "Program" },
  },
  {
    path: "/programs/{slug}",
    method: "get",
    operationId: "getProgram",
    summary: "Get program by slug",
    tag: "Programs",
    parameters: [SLUG_REF],
    response: { kind: "singleInData", schemaRef: "Program" },
  },
  {
    path: "/programs/{slug}/versions",
    method: "get",
    operationId: "getProgramVersions",
    summary: "Get program version history",
    description: "Returns every version of the program from the `entity_versions` audit table.",
    tag: "Programs",
    parameters: [SLUG_REF],
    response: {
      kind: "raw",
      schema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/EntityVersion" },
          },
        },
      },
    },
  },

  // -----------------------
  // Search
  // -----------------------
  {
    path: "/search",
    method: "get",
    operationId: "search",
    summary: "Global search",
    description: "Full-text search across every entity type. Returns grouped results.",
    tag: "Search",
    parameters: [
      {
        name: "q",
        in: "query",
        required: true,
        description: "Search query (min 2 chars, max 200)",
        schema: { type: "string", minLength: 2, maxLength: 200 },
        example: "Pacific Gas",
      },
      {
        name: "limit",
        in: "query",
        description: "Max results per entity type (1-25)",
        schema: { type: "integer", minimum: 1, maximum: 25, default: 5 },
      },
      {
        name: "types",
        in: "query",
        description:
          "Comma-separated entity types to search (utilities, programs, power-plants, ev-stations, pricing-nodes, transmission-lines, isos, rtos, balancing-authorities)",
        schema: STRING,
        example: "utilities,isos",
      },
    ],
    response: { kind: "raw", schema: { $ref: "#/components/schemas/SearchResults" } },
    has404: false,
  },

  // -----------------------
  // Changelog
  // -----------------------
  {
    path: "/changelog",
    method: "get",
    operationId: "getChangelog",
    summary: "Get changelog",
    description:
      "Recent additions and updates across every entity type. Backed by the `entity_versions` audit table with a static fallback.",
    tag: "Changelog",
    parameters: [
      {
        name: "limit",
        in: "query",
        description: "Max entries to return (1-200, default 50)",
        schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      {
        name: "offset",
        in: "query",
        description: "Offset for pagination (default 0)",
        schema: { type: "integer", minimum: 0, default: 0 },
      },
      {
        name: "entity_type",
        in: "query",
        description:
          "Filter by entity type (utility, iso, rto, balancing-authority, power_plant, ev_station, transmission_line, pricing_node, program)",
        schema: STRING,
      },
      {
        name: "since",
        in: "query",
        description: "ISO timestamp — only return entries at or after this time",
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "kind",
        in: "query",
        description: "Filter by kind (added, updated)",
        schema: { type: "string", enum: ["added", "updated"] },
      },
    ],
    response: { kind: "raw", schema: { $ref: "#/components/schemas/ChangelogResponse" } },
    has404: false,
  },
];
