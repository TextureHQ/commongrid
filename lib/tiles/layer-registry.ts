/**
 * Vector tile layer registry — the single source of truth for which tile
 * layers CommonGrid publishes and how they are described.
 *
 * Both the tile routes (`app/api/tiles/{layer}/[z]/[x]/[y]`) and the TileJSON
 * routes (`app/api/tiles/{layer}.json`, `app/api/tiles.json`) read from here,
 * so a new layer cannot be half-registered.
 *
 * ---------------------------------------------------------------------------
 * Why editorial metadata lives here instead of in the PMTiles archives
 * ---------------------------------------------------------------------------
 *
 * A PMTiles archive carries its own `name`/`description` in its embedded
 * metadata, and reading those would be the obvious "don't repeat yourself"
 * choice. We deliberately do NOT do that, because archive metadata is a
 * snapshot of whatever `tippecanoe` flags were used the last time that layer
 * was generated — which can be months or years ago, on someone's laptop, with
 * a since-abandoned project name or a missing `--name` flag entirely.
 *
 * Editorial fields (`name`, `description`, `attribution`) are therefore
 * curated here in version control, where they are reviewable and correct.
 *
 * Factual geometry fields (`minzoom`, `maxzoom`, `bounds`, `vector_layers`)
 * are the opposite case: they describe what is physically inside the archive
 * and MUST track regeneration, so those are read from the archive at request
 * time. See `lib/tiles/tilejson.ts`.
 *
 * Keep that split intact. Sourcing `name` from archive metadata would publish
 * stale project names on a public endpoint.
 */

/** Canonical tile layer identifiers. Also the PMTiles archive basenames. */
export const TILE_LAYER_IDS = [
  "territories",
  "power-plants",
  "substations",
  "transmission-lines",
  "pricing-nodes",
  "ev-charging",
] as const;

export type TileLayerId = (typeof TILE_LAYER_IDS)[number];

export interface TileLayerDefinition {
  /** URL segment + PMTiles archive basename + MVT source-layer name. */
  id: TileLayerId;
  /** Human-readable layer title. */
  name: string;
  /** One-line description of what the layer contains. */
  description: string;
  /** Upstream data source, rendered into the TileJSON `attribution` field. */
  sourceAttribution: string;
}

const COMMONGRID_ATTRIBUTION = '<a href="https://commongrid.info">CommonGrid</a>';

export const TILE_LAYERS: Record<TileLayerId, TileLayerDefinition> = {
  territories: {
    id: "territories",
    name: "CommonGrid Utility Service Territories",
    description: "Electric utility and grid-operator service-territory boundaries for the United States.",
    sourceAttribution: "EIA Form 861",
  },
  "power-plants": {
    id: "power-plants",
    name: "CommonGrid Power Plants",
    description: "Electric generating facilities in the United States, including fuel type and nameplate capacity.",
    sourceAttribution: "EIA Form 860 / 860M",
  },
  substations: {
    id: "substations",
    name: "CommonGrid Substations",
    description: "Electric substations in the United States, including voltage class and operator.",
    sourceAttribution: "OpenStreetMap",
  },
  "transmission-lines": {
    id: "transmission-lines",
    name: "CommonGrid Transmission Lines",
    description: "High-voltage electric transmission line centerlines in the United States.",
    sourceAttribution: "HIFLD",
  },
  "pricing-nodes": {
    id: "pricing-nodes",
    name: "CommonGrid Pricing Nodes",
    description: "Wholesale electricity pricing nodes and trading hubs published by US ISOs and RTOs.",
    sourceAttribution: "ISO/RTO public filings",
  },
  "ev-charging": {
    id: "ev-charging",
    name: "CommonGrid EV Charging Stations",
    description: "Public and private electric vehicle charging stations in the United States.",
    sourceAttribution: "DOE Alternative Fuels Data Center",
  },
};

/** Type guard for untrusted route params. */
export function isTileLayerId(value: string): value is TileLayerId {
  return (TILE_LAYER_IDS as readonly string[]).includes(value);
}

/** Full attribution string for a layer: CommonGrid plus the upstream source. */
export function tileLayerAttribution(layer: TileLayerDefinition): string {
  return `${COMMONGRID_ATTRIBUTION} | ${layer.sourceAttribution}`;
}
