/**
 * Shared registry for CommonGrid vector tile layers.
 *
 * This module is the single source of truth for CURATED, HUMAN-WRITTEN
 * TileJSON metadata: `name`, `description`, and `attribution`.
 *
 * WHY NOT READ THESE FROM PMTILES METADATA?
 * Several archives were built before the CommonGrid rename and still carry
 * "OpenGrid ..." in their metadata `name` field; one archive (ev-charging)
 * was built without `--name` and exposes a filesystem path. These strings are
 * public-facing on the TileJSON endpoints, so they must be curated here, not
 * derived from the archives.
 *
 * The factual geometry properties — `minzoom`, `maxzoom`, `bounds`, and
 * `vector_layers` — ARE read from the archives at runtime via
 * `getArchiveMetadata()` in `lib/pmtiles-server.ts`, so TileJSON self-heals
 * when archives are rebuilt with new fields or different coverage.
 */

export interface TileLayerDef {
  /** URL-safe layer id and PMTiles archive name. */
  id: string;
  /** Human-readable layer title. */
  name: string;
  /** Short description for TileJSON. */
  description: string;
  /** Upstream data source attribution (HTML). */
  attribution: string;
}

// ---------------------------------------------------------------------------
// Layer registry
// ---------------------------------------------------------------------------

export const TILE_LAYERS: TileLayerDef[] = [
  {
    id: "territories",
    name: "CommonGrid Utility Territories",
    description: "Utility service territory polygons derived from EIA-861 and other public sources.",
    attribution: '<a href="https://commongrid.info">CommonGrid</a> | EIA Form 861',
  },
  {
    id: "power-plants",
    name: "CommonGrid Power Plants",
    description: "US power generation facilities from EIA Form 860 and monthly Form 860M filings.",
    attribution: '<a href="https://commongrid.info">CommonGrid</a> | EIA Form 860/860M',
  },
  {
    id: "substations",
    name: "CommonGrid Substations",
    description: "Electrical substations from OpenStreetMap.",
    attribution: '<a href="https://commongrid.info">CommonGrid</a> | OpenStreetMap',
  },
  {
    id: "transmission-lines",
    name: "CommonGrid Transmission Lines",
    description: "High-voltage transmission lines from the HIFLD dataset.",
    attribution: '<a href="https://commongrid.info">CommonGrid</a> | HIFLD',
  },
  {
    id: "pricing-nodes",
    name: "CommonGrid Pricing Nodes",
    description: "Wholesale electricity pricing nodes and hubs from ISO/RTO public filings.",
    attribution: '<a href="https://commongrid.info">CommonGrid</a> | ISO/RTO public filings',
  },
  {
    id: "ev-charging",
    name: "CommonGrid EV Charging Stations",
    description: "Public EV charging stations from the DOE Alternative Fuels Data Center.",
    attribution: '<a href="https://commongrid.info">CommonGrid</a> | DOE AFDC',
  },
];

/** Map from layer id to its definition for O(1) lookups. */
export const TILE_LAYER_BY_ID = new Map(TILE_LAYERS.map((layer) => [layer.id, layer]));

/** All published layer ids in canonical order. */
export function getTileLayerIds(): string[] {
  return TILE_LAYERS.map((layer) => layer.id);
}

/** Look up a layer definition by id, or undefined if not published. */
export function getTileLayerById(id: string): TileLayerDef | undefined {
  return TILE_LAYER_BY_ID.get(id);
}

/** Validate that a layer id is published. */
export function isTileLayerId(id: string): id is (typeof TILE_LAYERS)[number]["id"] {
  return TILE_LAYER_BY_ID.has(id);
}
