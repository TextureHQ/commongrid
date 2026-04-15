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

export type { ApiKeyInsert, ApiKeySelect } from "./api-keys";
export { apiKeys } from "./api-keys";
export type {
  BalancingAuthorityInsert,
  BalancingAuthoritySelect,
} from "./balancing-authorities";
export { balancingAuthorities } from "./balancing-authorities";
export type {
  BulkOperationInsert,
  BulkOperationSelect,
} from "./bulk-operations";
export { bulkOperations } from "./bulk-operations";
export type {
  EntityVersionInsert,
  EntityVersionSelect,
} from "./entity-versions";
// Support Tables
export { entityVersions } from "./entity-versions";
export type { EvStationInsert, EvStationSelect } from "./ev-stations";
export { evStations } from "./ev-stations";
export type { IsoInsert, IsoSelect } from "./isos";
// Core Entity Tables
export { isos } from "./isos";
export type { PowerPlantInsert, PowerPlantSelect } from "./power-plants";
// Extended Entity Tables
export { powerPlants } from "./power-plants";
export type { PricingNodeInsert, PricingNodeSelect } from "./pricing-nodes";
export { pricingNodes } from "./pricing-nodes";
export type { ProgramInsert, ProgramSelect } from "./programs";
export { programs } from "./programs";
export type { RegionInsert, RegionSelect } from "./regions";
export { regions } from "./regions";
export type { RtoInsert, RtoSelect } from "./rtos";
export { rtos } from "./rtos";
export type { TerritoryInsert, TerritorySelect } from "./territories";
// Spatial Table
export { territories } from "./territories";
export type {
  TransmissionLineInsert,
  TransmissionLineSelect,
} from "./transmission-lines";
export { transmissionLines } from "./transmission-lines";
export type { UtilityInsert, UtilitySelect } from "./utilities";
export { utilities } from "./utilities";
