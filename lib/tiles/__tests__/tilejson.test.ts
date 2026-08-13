/**
 * TileJSON contract tests.
 *
 * These assert two separate things:
 *
 *   1. The documents we publish are structurally valid TileJSON 3.0.0.
 *   2. The metadata we publish matches what is physically in the PMTiles
 *      archives. This is the important one — it means regenerating tiles with
 *      different attributes or a different zoom ceiling fails CI instead of
 *      silently publishing a TileJSON that lies to consumers.
 */

import { describe, expect, it } from "vitest";

import { getArchiveInfo } from "@/lib/pmtiles-server";
import { MAX_TILE_ZOOM } from "@/lib/tile-utils";
import { isTileLayerId, TILE_LAYER_IDS, TILE_LAYERS, tileLayerAttribution } from "@/lib/tiles/layer-registry";
import { buildTileJson, resolveOrigin, tileJsonUrl, tileUrlTemplate } from "@/lib/tiles/tilejson";

const ORIGIN = "https://commongrid.info";

describe("tile layer registry", () => {
  it("registers all six published layers", () => {
    expect([...TILE_LAYER_IDS]).toEqual([
      "territories",
      "power-plants",
      "substations",
      "transmission-lines",
      "pricing-nodes",
      "ev-charging",
    ]);
  });

  it("has a definition for every id, keyed consistently", () => {
    for (const id of TILE_LAYER_IDS) {
      expect(TILE_LAYERS[id]).toBeDefined();
      expect(TILE_LAYERS[id].id).toBe(id);
    }
  });

  it("never publishes a pre-rename or filesystem-path layer name", () => {
    // Four archives still carry `OpenGrid *` in their embedded metadata and
    // ev-charging carries its own output path (CIR-1286). Editorial fields come
    // from this registry precisely so those never reach a public response.
    for (const id of TILE_LAYER_IDS) {
      const { name, description } = TILE_LAYERS[id];
      expect(name).not.toMatch(/opengrid/i);
      expect(name).not.toMatch(/\.pmtiles/);
      expect(name).toMatch(/^CommonGrid /);
      expect(description).not.toMatch(/opengrid/i);
      expect(description).not.toMatch(/\.pmtiles/);
      expect(description.length).toBeGreaterThan(20);
    }
  });

  it("credits CommonGrid and the upstream source", () => {
    for (const id of TILE_LAYER_IDS) {
      const attribution = tileLayerAttribution(TILE_LAYERS[id]);
      expect(attribution).toContain("commongrid.info");
      expect(attribution).toContain(TILE_LAYERS[id].sourceAttribution);
    }
  });

  it("guards unknown layer ids", () => {
    expect(isTileLayerId("power-plants")).toBe(true);
    expect(isTileLayerId("utilities")).toBe(false);
    expect(isTileLayerId("../../etc/passwd")).toBe(false);
    expect(isTileLayerId("")).toBe(false);
  });
});

describe("url helpers", () => {
  it("builds an absolute xyz tile template", () => {
    expect(tileUrlTemplate(ORIGIN, "power-plants")).toBe("https://commongrid.info/api/tiles/power-plants/{z}/{x}/{y}");
  });

  it("builds an absolute tilejson url", () => {
    expect(tileJsonUrl(ORIGIN, "territories")).toBe("https://commongrid.info/api/tiles/territories.json");
  });

  it("derives the origin from the request host", () => {
    expect(resolveOrigin(new Request("https://commongrid.info/api/tiles.json"))).toBe("https://commongrid.info");
  });

  it("prefers forwarded headers so previews self-reference", () => {
    const request = new Request("https://internal-deployment.vercel.app/api/tiles.json", {
      headers: { "x-forwarded-host": "commongrid-preview.vercel.app", "x-forwarded-proto": "https" },
    });
    expect(resolveOrigin(request)).toBe("https://commongrid-preview.vercel.app");
  });

  it("uses http for local development", () => {
    expect(resolveOrigin(new Request("http://localhost:3000/api/tiles.json"))).toBe("http://localhost:3000");
  });
});

describe.each([...TILE_LAYER_IDS])("TileJSON for %s", (layerId) => {
  it("is a structurally valid TileJSON 3.0.0 document", async () => {
    const doc = await buildTileJson(TILE_LAYERS[layerId], ORIGIN);

    expect(doc.tilejson).toBe("3.0.0");
    expect(doc.scheme).toBe("xyz");
    expect(doc.name).toBe(TILE_LAYERS[layerId].name);
    expect(doc.description).toBe(TILE_LAYERS[layerId].description);
    expect(doc.attribution).toContain("commongrid.info");

    // Tile URLs must be absolute per spec, and must carry all three templates.
    expect(doc.tiles).toHaveLength(1);
    expect(doc.tiles[0]).toMatch(/^https?:\/\//);
    expect(doc.tiles[0]).toContain("{z}");
    expect(doc.tiles[0]).toContain("{x}");
    expect(doc.tiles[0]).toContain("{y}");

    expect(doc.minzoom).toBeGreaterThanOrEqual(0);
    expect(doc.maxzoom).toBeGreaterThan(doc.minzoom);
    expect(doc.maxzoom).toBeLessThanOrEqual(MAX_TILE_ZOOM);

    // bounds = [minLon, minLat, maxLon, maxLat], within valid WGS84 ranges.
    expect(doc.bounds).toHaveLength(4);
    const [minLon, minLat, maxLon, maxLat] = doc.bounds;
    expect(minLon).toBeGreaterThanOrEqual(-180);
    expect(maxLon).toBeLessThanOrEqual(180);
    expect(minLat).toBeGreaterThanOrEqual(-90);
    expect(maxLat).toBeLessThanOrEqual(90);
    expect(maxLon).toBeGreaterThan(minLon);
    expect(maxLat).toBeGreaterThan(minLat);

    expect(doc.center).toHaveLength(3);

    expect(doc.vector_layers.length).toBeGreaterThan(0);
    for (const vl of doc.vector_layers) {
      expect(vl.id).toBeTruthy();
      expect(Object.keys(vl.fields).length).toBeGreaterThan(0);
    }
  });

  it("matches the zoom range and fields actually inside the archive", async () => {
    const [doc, info] = await Promise.all([buildTileJson(TILE_LAYERS[layerId], ORIGIN), getArchiveInfo(layerId)]);

    expect(doc.minzoom).toBe(info.minzoom);
    expect(doc.maxzoom).toBe(Math.min(info.maxzoom, MAX_TILE_ZOOM));
    expect(doc.bounds).toEqual(info.bounds);

    // Field names must come from the archive, never from the REST API types.
    // (power-plants tiles emit `capacityMw`; the JSON API calls it
    // `totalCapacityMw` — publishing the latter would break `setPaintProperty`.)
    expect(doc.vector_layers.map((vl) => vl.id)).toEqual(info.vectorLayers.map((vl) => vl.id));
    for (const [i, vl] of doc.vector_layers.entries()) {
      expect(Object.keys(vl.fields).sort()).toEqual(Object.keys(info.vectorLayers[i].fields ?? {}).sort());
    }
  });

  it("exposes the layer id as an MVT source-layer", async () => {
    // Every archive is built with `--layer=<id>`, so a consumer can rely on
    // `source-layer: <layer id>` without reading the vector_layers array.
    const doc = await buildTileJson(TILE_LAYERS[layerId], ORIGIN);
    expect(doc.vector_layers.map((vl) => vl.id)).toContain(layerId);
  });
});
