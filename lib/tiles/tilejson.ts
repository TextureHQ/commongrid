/**
 * TileJSON 3.0.0 document construction helpers.
 *
 * See https://github.com/mapbox/tilejson-spec/tree/master/3.0.0
 */

import { type ArchiveMetadata, getArchiveMetadata } from "@/lib/pmtiles-server";
import type { TileLayerDef } from "./layer-registry";

/** TileJSON 3.0.0 document shape returned by CommonGrid. */
export interface TileJsonDocument {
  tilejson: "3.0.0";
  name: string;
  description: string;
  version?: string;
  attribution?: string;
  scheme: "xyz";
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: number[];
  center?: number[];
  vector_layers: {
    id: string;
    fields: Record<string, string>;
    description?: string;
  }[];
}

/**
 * Build a fully-qualified origin for tile URLs from an incoming request.
 *
 * On Vercel, `req.headers.get("x-forwarded-host")` is the most reliable way
 * to get the public-facing host for both production and preview deployments.
 * `req.url` in Next.js edge functions is typically a local `http://localhost:3000`
 * value, so we reconstruct the origin from the forwarded host + protocol.
 *
 * We prefer the forwarded host because:
 *   - it works for custom domains (`commongrid.info`), `*.vercel.app` previews,
 *     branch previews, and local `next dev` behind a proxy;
 *   - it is supplied by the edge router, not by Node's request socket.
 *
 * Fallback chain:
 *   1. `x-forwarded-host` + `x-forwarded-proto`
 *   2. `host` header + `x-forwarded-proto`
 *   3. `VERCEL_URL` (Vercel-injected, no protocol)
 *   4. `localhost:3000` (local dev default)
 */
function getRequestOrigin(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host") ?? process.env.VERCEL_URL ?? "localhost:3000";
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protocol = forwardedProto?.split(",")[0]?.trim() ?? "https";
  return `${protocol}://${host}`;
}

/**
 * Build an absolute tile URL template for a layer.
 *
 * The template points at the canonical dynamic endpoint `/api/tiles/{layer}/...
 * next.config.mjs rewrites legacy `/tiles/{layer}/...` requests here as well,
 * but the TileJSON contract exposes the canonical API path.
 */
export function buildTileUrlTemplate(req: Request, layerId: string): string {
  const origin = getRequestOrigin(req);
  return `${origin}/api/tiles/${layerId}/{z}/{x}/{y}`;
}

/**
 * Assemble a complete TileJSON document for a layer using runtime archive
 * metadata (bounds, zoom range, vector layer fields).
 *
 * `name`, `description`, and `attribution` come from the curated registry
 * because the archives' own metadata carries stale or missing titles.
 */
export function buildTileJson(req: Request, layer: TileLayerDef, metadata: ArchiveMetadata): TileJsonDocument {
  return {
    tilejson: "3.0.0",
    name: layer.name,
    description: layer.description,
    version: "1.0.0",
    attribution: layer.attribution,
    scheme: "xyz",
    tiles: [buildTileUrlTemplate(req, layer.id)],
    minzoom: metadata.minzoom,
    maxzoom: metadata.maxzoom,
    bounds: [metadata.bounds.west, metadata.bounds.south, metadata.bounds.east, metadata.bounds.north],
    vector_layers: metadata.vectorLayers.map((vl) => ({
      id: vl.id,
      fields: vl.fields,
      description: vl.description,
    })),
  };
}

/**
 * Build the index listing all TileJSON endpoints.
 */
export function buildTileJsonIndex(req: Request): { layers: { id: string; name: string; tilejsonUrl: string }[] } {
  const origin = getRequestOrigin(req);
  return {
    layers: [
      {
        id: "territories",
        name: "CommonGrid Utility Territories",
        tilejsonUrl: `${origin}/api/tiles/territories.json`,
      },
      { id: "power-plants", name: "CommonGrid Power Plants", tilejsonUrl: `${origin}/api/tiles/power-plants.json` },
      { id: "substations", name: "CommonGrid Substations", tilejsonUrl: `${origin}/api/tiles/substations.json` },
      {
        id: "transmission-lines",
        name: "CommonGrid Transmission Lines",
        tilejsonUrl: `${origin}/api/tiles/transmission-lines.json`,
      },
      { id: "pricing-nodes", name: "CommonGrid Pricing Nodes", tilejsonUrl: `${origin}/api/tiles/pricing-nodes.json` },
      {
        id: "ev-charging",
        name: "CommonGrid EV Charging Stations",
        tilejsonUrl: `${origin}/api/tiles/ev-charging.json`,
      },
    ],
  };
}

/** Convenience re-export for callers that need to read archive metadata. */
export { getArchiveMetadata };
