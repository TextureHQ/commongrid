/**
 * TileJSON 3.0.0 document construction.
 *
 * Spec: https://github.com/mapbox/tilejson-spec/tree/master/3.0.0
 *
 * A TileJSON document is what lets a client add one of our layers with a single
 * URL instead of hand-transcribing the tile URL template, zoom range, and
 * source-layer name out of our source code:
 *
 *   map.addSource("cg", { type: "vector", url: ".../api/tiles/power-plants.json" })
 *
 * Values come from two places on purpose (see `layer-registry.ts` for the full
 * rationale): editorial fields from the in-repo registry, factual geometry
 * fields read live from the PMTiles archive.
 */

import { getArchiveInfo } from "@/lib/pmtiles-server";
import { MAX_TILE_ZOOM } from "@/lib/tile-utils";
import { type TileLayerDefinition, tileLayerAttribution } from "./layer-registry";

export interface TileJson {
  tilejson: "3.0.0";
  name: string;
  description: string;
  attribution: string;
  scheme: "xyz";
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  center: [number, number, number];
  vector_layers: Array<{
    id: string;
    fields: Record<string, string>;
    minzoom?: number;
    maxzoom?: number;
  }>;
}

/**
 * Resolve the absolute origin to embed in `tiles[]`.
 *
 * TileJSON requires absolute tile URLs, so we cannot emit a relative path.
 *
 * We derive the origin from the incoming request rather than from a hardcoded
 * production hostname or from `VERCEL_URL`:
 *
 *   - Hardcoding `https://commongrid.info` would make every preview deployment
 *     serve a TileJSON pointing at production, so a preview could never be used
 *     to test tile changes.
 *   - `VERCEL_URL` is the deployment's internal hostname, not the alias the
 *     caller actually used, so it produces URLs that work but look wrong (and
 *     bypass the production domain's CDN cache).
 *
 * The request host is what the caller successfully reached us on, which is by
 * definition a working origin for the tile URLs too. On Vercel, `x-forwarded-*`
 * headers are set by the platform edge.
 */
export function resolveOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  const host = forwardedHost ?? url.host;
  // Local dev serves plain HTTP; anything else is HTTPS in practice.
  const proto = forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

/** Canonical tile URL template for a layer, e.g. `/api/tiles/power-plants/{z}/{x}/{y}`. */
export function tileUrlTemplate(origin: string, layerId: string): string {
  return `${origin}/api/tiles/${layerId}/{z}/{x}/{y}`;
}

/** URL of a layer's own TileJSON document. */
export function tileJsonUrl(origin: string, layerId: string): string {
  return `${origin}/api/tiles/${layerId}.json`;
}

/**
 * Build the TileJSON document for one layer.
 *
 * `maxzoom` is clamped to `MAX_TILE_ZOOM`. Requests above that zoom are served
 * by `resolveOverzoom()`, which returns the highest-zoom ancestor tile so the
 * client can overzoom it — meaning tiles above the cap contain no additional
 * detail. Advertising a higher `maxzoom` would make clients request duplicate
 * payloads; advertising the real cap lets them overzoom locally instead.
 */
export async function buildTileJson(layer: TileLayerDefinition, origin: string): Promise<TileJson> {
  const info = await getArchiveInfo(layer.id);

  return {
    tilejson: "3.0.0",
    name: layer.name,
    description: layer.description,
    attribution: tileLayerAttribution(layer),
    scheme: "xyz",
    tiles: [tileUrlTemplate(origin, layer.id)],
    minzoom: info.minzoom,
    maxzoom: Math.min(info.maxzoom, MAX_TILE_ZOOM),
    bounds: info.bounds,
    center: info.center,
    vector_layers: info.vectorLayers.map((vl) => ({
      id: vl.id,
      fields: vl.fields ?? {},
      ...(vl.minzoom !== undefined ? { minzoom: vl.minzoom } : {}),
      ...(vl.maxzoom !== undefined ? { maxzoom: vl.maxzoom } : {}),
    })),
  };
}
