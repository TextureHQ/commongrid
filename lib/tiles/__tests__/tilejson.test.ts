import { describe, expect, it } from "vitest";
import { getTileLayerIds, TILE_LAYERS } from "@/lib/tiles/layer-registry";
import { buildTileJson, buildTileJsonIndex, buildTileUrlTemplate } from "@/lib/tiles/tilejson";

function makeRequest(host: string, proto = "https", pathname = "/api/tiles/power-plants.json"): Request {
  return new Request(`${proto}://${host}${pathname}`, {
    headers: {
      host,
      "x-forwarded-host": host,
      "x-forwarded-proto": proto,
    },
  });
}

describe("TileJSON document generation from archive metadata", () => {
  for (const layer of TILE_LAYERS) {
    it(`produces a valid TileJSON 3.0.0 document for ${layer.id}`, async () => {
      const { getArchiveMetadata } = await import("@/lib/pmtiles-server");
      const metadata = await getArchiveMetadata(layer.id);
      expect(metadata).not.toBeNull();
      if (!metadata) {
        throw new Error(`Missing archive metadata for ${layer.id}`);
      }

      const req = makeRequest("commongrid.info");
      const doc = buildTileJson(req, layer, metadata);

      expect(doc.tilejson).toBe("3.0.0");
      expect(doc.name).toBeTruthy();
      expect(doc.description).toBe(layer.description);
      expect(doc.attribution).toBe(layer.attribution);
      expect(doc.scheme).toBe("xyz");
      expect(doc.tiles).toHaveLength(1);
      expect(doc.tiles[0]).toMatch(/^https:\/\/commongrid\.info\/api\/tiles\/[^/]+\/\{z\}\/\{x\}\/\{y\}$/);
      expect(doc.minzoom).toBe(metadata.minzoom);
      expect(doc.maxzoom).toBe(metadata.maxzoom);
      expect(doc.bounds).toHaveLength(4);
      expect(doc.bounds[0]).toBeLessThanOrEqual(doc.bounds[2]); // west <= east
      expect(doc.bounds[1]).toBeLessThanOrEqual(doc.bounds[3]); // south <= north
      expect(doc.vector_layers).toBeInstanceOf(Array);
      expect(doc.vector_layers.length).toBeGreaterThan(0);

      const vectorLayer = doc.vector_layers[0];
      expect(vectorLayer.id).toBeTruthy();
      expect(Object.keys(vectorLayer.fields).length).toBeGreaterThan(0);
      for (const fieldType of Object.values(vectorLayer.fields)) {
        expect(["String", "Number", "Boolean"]).toContain(fieldType);
      }
    });
  }
});

describe("TileJSON archive metadata matches hardcoded reality", () => {
  it("reflects the known field sets for each layer", async () => {
    const { getArchiveMetadata } = await import("@/lib/pmtiles-server");

    const expected: Record<string, string[]> = {
      // Mirrors the `properties` object in scripts/prepare-territory-geojson.mjs.
      // baCode has been emitted there since #170 (April), but the committed
      // archives were not rebuilt between February and #342, so this list was
      // written against six-month-old tiles rather than against the generator.
      territories: ["baCode", "customerCount", "eiaId", "name", "segment", "slug", "state"],
      "power-plants": ["capacityMw", "fuelCategory", "name", "slug", "status"],
      substations: [
        "county",
        "id",
        "maxVoltageKv",
        "minVoltageKv",
        "name",
        "ownerName",
        "slug",
        "source",
        "state",
        "status",
        "substationType",
        "voltageBand",
      ],
      "transmission-lines": [
        "id",
        "lengthMiles",
        "objectId",
        "owner",
        "status",
        "type",
        "voltage",
        "voltageClass",
        "voltageRank",
      ],
      "pricing-nodes": ["iso", "name", "nodeType", "slug", "state", "zone"],
      "ev-charging": [
        "accessCode",
        "dcFastCount",
        "facilityType",
        "level1Count",
        "level2Count",
        "name",
        "network",
        "slug",
        "status",
      ],
    };

    for (const layer of TILE_LAYERS) {
      const metadata = await getArchiveMetadata(layer.id);
      expect(metadata).not.toBeNull();
      const layerIds = metadata?.vectorLayers.map((vl) => vl.id) ?? [];
      expect(layerIds.length).toBeGreaterThan(0);

      const fields = Object.keys(metadata?.vectorLayers[0].fields ?? {}).sort();
      expect(fields).toEqual(expected[layer.id].sort());
    }
  });
});

describe("TileJSON absolute URL template", () => {
  it("uses the request's forwarded host in production", () => {
    const req = makeRequest("commongrid.info");
    const url = buildTileUrlTemplate(req, "power-plants");
    expect(url).toBe("https://commongrid.info/api/tiles/power-plants/{z}/{x}/{y}");
  });

  it("works for Vercel preview deployments", () => {
    const req = makeRequest("commongrid-git-feature.vercel.app");
    const url = buildTileUrlTemplate(req, "ev-charging");
    expect(url).toBe("https://commongrid-git-feature.vercel.app/api/tiles/ev-charging/{z}/{x}/{y}");
  });

  it("falls back to https when no forwarded protocol is present", () => {
    const req = new Request("http://localhost:3000/api/tiles/territories.json", {
      headers: { host: "localhost:3000" },
    });
    const url = buildTileUrlTemplate(req, "territories");
    expect(url).toBe("https://localhost:3000/api/tiles/territories/{z}/{x}/{y}");
  });
});

describe("TileJSON index", () => {
  it("lists every registered layer", () => {
    const req = makeRequest("commongrid.info");
    const index = buildTileJsonIndex(req);

    const ids = index.layers.map((l) => l.id);
    expect(ids).toEqual(getTileLayerIds());

    for (const entry of index.layers) {
      expect(entry.tilejsonUrl).toMatch(/^https:\/\/commongrid\.info\/api\/tiles\/[\w-]+\.json$/);
    }
  });
});

describe("Layer registry invariants", () => {
  it("has the expected six layers in canonical order", () => {
    expect(getTileLayerIds()).toEqual([
      "territories",
      "power-plants",
      "substations",
      "transmission-lines",
      "pricing-nodes",
      "ev-charging",
    ]);
  });
});
