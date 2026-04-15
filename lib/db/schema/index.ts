/**
 * CommonGrid Database Schema — Barrel Export
 *
 * All 14 database tables defined using Drizzle ORM's type-safe API.
 * See docs/specs/persistence-api.md Section 3 for the full schema spec.
 *
 * Core entities: isos, rtos, balancing_authorities, regions, utilities
 * Extended entities: power_plants, ev_stations, transmission_lines, pricing_nodes, programs
 * Spatial: territories (PostGIS GEOGRAPHY/GEOMETRY)
 * Support: entity_versions (delta-based), api_keys (scoped), bulk_operations (idempotency)
 */

// Core Entity Tables
export { isos } from "./isos";
export type { IsoSelect, IsoInsert } from "./isos";

export { rtos } from "./rtos";
export type { RtoSelect, RtoInsert } from "./rtos";

export { balancingAuthorities } from "./balancing-authorities";
export type {
  BalancingAuthoritySelect,
  BalancingAuthorityInsert,
} from "./balancing-authorities";

export { regions } from "./regions";
export type { RegionSelect, RegionInsert } from "./regions";

export { utilities } from "./utilities";
export type { UtilitySelect, UtilityInsert } from "./utilities";

// Extended Entity Tables
export { powerPlants } from "./power-plants";
export type { PowerPlantSelect, PowerPlantInsert } from "./power-plants";

export { evStations } from "./ev-stations";
export type { EvStationSelect, EvStationInsert } from "./ev-stations";

export { transmissionLines } from "./transmission-lines";
export type {
  TransmissionLineSelect,
  TransmissionLineInsert,
} from "./transmission-lines";

export { pricingNodes } from "./pricing-nodes";
export type { PricingNodeSelect, PricingNodeInsert } from "./pricing-nodes";

export { programs } from "./programs";
export type { ProgramSelect, ProgramInsert } from "./programs";

// Spatial Table
export { territories } from "./territories";
export type { TerritorySelect, TerritoryInsert } from "./territories";

// Support Tables
export { entityVersions } from "./entity-versions";
export type {
  EntityVersionSelect,
  EntityVersionInsert,
} from "./entity-versions";

export { apiKeys } from "./api-keys";
export type { ApiKeySelect, ApiKeyInsert } from "./api-keys";

export { bulkOperations } from "./bulk-operations";
export type {
  BulkOperationSelect,
  BulkOperationInsert,
} from "./bulk-operations";
