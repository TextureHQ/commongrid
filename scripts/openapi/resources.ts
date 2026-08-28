/**
 * Resource registry — maps the public OpenAPI schema name (e.g. `Utility`)
 * to the Drizzle table it derives from + per-field customizations.
 *
 * Keep this list in sync with the "Public resource allowlist" section of
 * the auto-generated `public/openapi.json`.
 */

import { balancingAuthorities } from "../../lib/db/schema/balancing-authorities";
import { evStations } from "../../lib/db/schema/ev-stations";
import { isos } from "../../lib/db/schema/isos";
import { powerPlants } from "../../lib/db/schema/power-plants";
import { pricingNodes } from "../../lib/db/schema/pricing-nodes";
import { programs } from "../../lib/db/schema/programs";
import { regions } from "../../lib/db/schema/regions";
import { rtos } from "../../lib/db/schema/rtos";
import { substations } from "../../lib/db/schema/substations";
import { territories } from "../../lib/db/schema/territories";
import { transmissionLines } from "../../lib/db/schema/transmission-lines";
import { utilities } from "../../lib/db/schema/utilities";
import { DESCRIPTIONS } from "./descriptions";
import { type JsonSchema, type SchemaOptions, tableToSchema } from "./schema-from-drizzle";

// biome-ignore lint/suspicious/noExplicitAny: Drizzle table union is too broad to type usefully
type DrizzleTable = any;

export interface ResourceDef {
  /** OpenAPI schema component name, e.g. "Utility" */
  schemaName: string;
  /** Drizzle table this resource is generated from */
  table: DrizzleTable;
  /** Optional schema-generation overrides */
  options?: SchemaOptions;
}

/**
 * jsonb array overrides — for columns where we know the runtime shape.
 * `{}` (permissive object) is the default fallback in `schema-from-drizzle.ts`.
 */
const STRING_ARRAY: JsonSchema = { type: "array", items: { type: "string" } };
const OBJECT_ARRAY: JsonSchema = { type: "array", items: { type: "object" } };

/**
 * Single source of truth for every public resource.
 * Order here drives the ordering of components.schemas in the output.
 */
export const RESOURCES: ResourceDef[] = [
  {
    schemaName: "Utility",
    table: utilities,
    options: { descriptions: DESCRIPTIONS.utility },
  },
  {
    schemaName: "Iso",
    table: isos,
    options: {
      descriptions: DESCRIPTIONS.iso,
      fieldOverrides: { states: STRING_ARRAY },
    },
  },
  {
    schemaName: "Rto",
    table: rtos,
    options: {
      descriptions: DESCRIPTIONS.rto,
      fieldOverrides: { states: STRING_ARRAY },
    },
  },
  {
    schemaName: "BalancingAuthority",
    table: balancingAuthorities,
    options: {
      descriptions: DESCRIPTIONS.balancingAuthority,
      fieldOverrides: { states: STRING_ARRAY },
    },
  },
  {
    schemaName: "Region",
    table: regions,
    options: { descriptions: DESCRIPTIONS.region },
  },
  {
    schemaName: "Territory",
    table: territories,
    options: {
      descriptions: DESCRIPTIONS.territory,
    },
  },
  {
    schemaName: "PowerPlant",
    table: powerPlants,
    options: {
      descriptions: DESCRIPTIONS.powerPlant,
      fieldOverrides: {
        technologies: STRING_ARRAY,
        energySources: STRING_ARRAY,
      },
    },
  },
  {
    schemaName: "Substation",
    table: substations,
    options: { descriptions: DESCRIPTIONS.substation },
  },
  {
    schemaName: "TransmissionLine",
    table: transmissionLines,
    options: { descriptions: DESCRIPTIONS.transmissionLine },
  },
  {
    schemaName: "EvStation",
    table: evStations,
    options: {
      descriptions: DESCRIPTIONS.evStation,
      fieldOverrides: { evConnectorTypes: STRING_ARRAY },
    },
  },
  {
    schemaName: "PricingNode",
    table: pricingNodes,
    options: { descriptions: DESCRIPTIONS.pricingNode },
  },
  {
    schemaName: "Program",
    table: programs,
    options: {
      descriptions: DESCRIPTIONS.program,
      fieldOverrides: {
        organizations: OBJECT_ARRAY,
        assetTypes: STRING_ARRAY,
        deviceTypes: STRING_ARRAY,
        marketSegments: STRING_ARRAY,
        participationModels: STRING_ARRAY,
        incentiveStructures: STRING_ARRAY,
        gridServices: STRING_ARRAY,
        regions: STRING_ARRAY,
        compensationTiers: OBJECT_ARRAY,
        programSeason: { type: "object" },
        variants: OBJECT_ARRAY,
      },
    },
  },
];

/**
 * Build the `components.schemas` map for every public resource plus the
 * handful of static/shared schemas we inherit from the previous hand-written
 * spec (ErrorResponse, PaginatedMeta, SearchResults, GeoJsonFeature).
 */
export function buildResourceSchemas(): Record<string, JsonSchema> {
  const out: Record<string, JsonSchema> = {};
  for (const res of RESOURCES) {
    out[res.schemaName] = tableToSchema(res.table, res.options);
  }
  return out;
}
