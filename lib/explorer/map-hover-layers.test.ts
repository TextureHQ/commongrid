import { describe, expect, it } from "vitest";
import {
  baseSourceId,
  buildHoverLayerConfigs,
  type ColorMapping,
  HOVER_EMPHASIS,
  type HoverColorMappings,
  type HoveredKeys,
  hoverFilter,
  matchColor,
  type TerritoryOutline,
} from "./map-hover-layers";

const mapping = (...keys: string[]): ColorMapping =>
  Object.fromEntries(keys.map((k, i) => [k, { hex: `#00000${i}` }])) as ColorMapping;

const NOTHING_HOVERED: HoveredKeys = {
  territory: null,
  transmission: null,
  powerPlant: null,
  substation: null,
  evCharging: null,
  pricingNode: null,
  gridOperator: null,
  program: null,
};

const MAPPINGS: HoverColorMappings = {
  voltageClass: mapping("extra-high", "high"),
  fuelCategory: mapping("Solar", "Coal"),
  voltageBand: mapping("medium", "high"),
  evNetwork: mapping("Tesla", "Blink Network"),
  pricingNodeIso: mapping("CAISO", "PJM"),
  gridOperator: mapping("iso-caiso", "ba-miso"),
  program: mapping("prog-demand-response"),
};

const OUTLINE: TerritoryOutline = { color: "#ff00aa" };

describe("buildHoverLayerConfigs", () => {
  it("reuses each base layer's source instead of declaring its own", () => {
    // Regression guard: highlights built as Edges layer specs declared a second
    // copy of the same tileset, which tripled tile requests on /explore.
    for (const cfg of buildHoverLayerConfigs(NOTHING_HOVERED, MAPPINGS, OUTLINE)) {
      expect(cfg.source).toBe(baseSourceId(cfg.base));
      expect(cfg).not.toHaveProperty("tileset");
    }
  });

  it("mirrors each base layer's minimum zoom so no tiles load earlier", () => {
    // A highlight with a lower minZoom than its base pulled tiles at zoom
    // levels where that layer isn't even shown.
    const byId = Object.fromEntries(buildHoverLayerConfigs(NOTHING_HOVERED, MAPPINGS, OUTLINE).map((c) => [c.id, c]));
    expect(byId["territory-hover-outline"].minZoom).toBe(0);
    expect(byId["transmission-hover"].minZoom).toBe(3);
    expect(byId["power-plants-hover"].minZoom).toBe(5);
    expect(byId["substations-hover"].minZoom).toBe(5);
    expect(byId["ev-charging-hover"].minZoom).toBe(5);
    expect(byId["pricing-nodes-hover"].minZoom).toBe(3);
  });

  it("covers every hoverable layer, with unique ids that don't collide with base layers", () => {
    const configs = buildHoverLayerConfigs(NOTHING_HOVERED, MAPPINGS, OUTLINE);
    expect(configs.map((c) => c.base).sort()).toEqual([
      "ev-charging",
      "grid-boundaries",
      "power-plants",
      "pricing-nodes",
      "program-boundaries",
      "substations",
      "territories",
      "transmission-lines",
    ]);
    const ids = configs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const cfg of configs) expect(cfg.id).not.toBe(cfg.base);
  });

  it("carries the hovered key through to its layer", () => {
    const configs = buildHoverLayerConfigs({ ...NOTHING_HOVERED, gridOperator: "ba:miso" }, MAPPINGS, OUTLINE);
    const byId = Object.fromEntries(configs.map((c) => [c.id, c]));
    expect(byId["grid-hover"].hovered).toBe("ba:miso");
    expect(byId["transmission-hover"].hovered).toBeNull();
  });

  it("outlines the hovered territory only where the territories layer shows it", () => {
    // The outline used to be its own Edges spec, which fetched the territories
    // tiles a second time. It must also respect the base layer's filter
    // (segment, program results), or it would outline a hidden utility.
    const segmentOnly = ["==", ["get", "segment"], "COOPERATIVE"];
    const configs = buildHoverLayerConfigs({ ...NOTHING_HOVERED, territory: "pacificorp" }, MAPPINGS, {
      color: "#ff00aa",
      filter: segmentOnly,
    });
    const outline = configs.find((c) => c.id === "territory-hover-outline");
    expect(outline?.source).toBe("territories-source");
    expect(outline?.hovered).toBe("pacificorp");
    expect(outline?.baseFilter).toEqual(segmentOnly);
    expect(outline?.paint["line-color"]).toBe("#ff00aa");
    expect(outline?.paint["line-width"]).toBe(3);
  });

  it("keys grid operators by kind + slug, not slug alone", () => {
    // Five ISOs share a slug with their balancing authority (caiso, ercot, …).
    const byId = Object.fromEntries(buildHoverLayerConfigs(NOTHING_HOVERED, MAPPINGS, OUTLINE).map((c) => [c.id, c]));
    expect(byId["grid-hover"].keyProp).toBe("hoverKey");
  });

  it("omits boundary highlights until their color mapping has loaded", () => {
    const configs = buildHoverLayerConfigs(
      NOTHING_HOVERED,
      { ...MAPPINGS, gridOperator: null, program: null },
      OUTLINE
    );
    expect(configs.map((c) => c.id)).not.toContain("grid-hover");
    expect(configs.map((c) => c.id)).not.toContain("program-hover");
    expect(configs).toHaveLength(6);
  });

  it("paints each highlight from its base layer's own colors", () => {
    // Emphasis comes from weight, never from a different color — the feature
    // keeps its segment/voltage/fuel color while hovered.
    const byId = Object.fromEntries(buildHoverLayerConfigs(NOTHING_HOVERED, MAPPINGS, OUTLINE).map((c) => [c.id, c]));
    expect(byId["transmission-hover"].paint["line-color"]).toEqual(matchColor("voltageClass", MAPPINGS.voltageClass));
    expect(byId["power-plants-hover"].paint["circle-color"]).toEqual(matchColor("fuelCategory", MAPPINGS.fuelCategory));
    // The region's edge is the fill color, not a contrasting outline: a bold
    // outline competes with the transmission lines drawn across the map.
    expect(byId["grid-hover"].paint["fill-outline-color"]).toEqual(byId["grid-hover"].paint["fill-color"]);
  });

  it("emphasizes each highlight well past its base layer's weight", () => {
    const byId = Object.fromEntries(buildHoverLayerConfigs(NOTHING_HOVERED, MAPPINGS, OUTLINE).map((c) => [c.id, c]));
    // Base layers: regions 0.18–0.2 fill, lines 1.5px, points radius 3–4 with
    // a 1px ring. A highlight has to clear those to read as highlighted.
    expect(byId["grid-hover"].paint["fill-opacity"]).toBe(HOVER_EMPHASIS.regionFillOpacity);
    expect(HOVER_EMPHASIS.regionFillOpacity).toBeGreaterThan(0.3);
    expect(byId["transmission-hover"].paint["line-width"]).toBe(HOVER_EMPHASIS.lineWidth);
    expect(HOVER_EMPHASIS.lineWidth).toBeGreaterThan(1.5 * 2);
    for (const id of ["power-plants-hover", "substations-hover", "ev-charging-hover", "pricing-nodes-hover"]) {
      expect(byId[id].paint["circle-radius"] as number).toBeGreaterThan(4);
      expect(byId[id].paint["circle-opacity"]).toBe(1);
      expect(byId[id].paint["circle-stroke-width"]).toBe(HOVER_EMPHASIS.pointRingWidth);
    }
  });
});

describe("hoverFilter", () => {
  it("selects only the hovered feature", () => {
    expect(hoverFilter("slug", "pacificorp")).toEqual(["==", ["get", "slug"], "pacificorp"]);
  });

  it("keeps the base layer's own filter when given one", () => {
    const base = ["==", ["get", "segment"], "COOPERATIVE"];
    expect(hoverFilter("slug", "pacificorp", base)).toEqual(["all", ["==", ["get", "slug"], "pacificorp"], base]);
  });

  it("matches nothing when nothing is hovered", () => {
    // An empty string rather than null: slugs are never empty, so the layer
    // renders nothing — the layer itself stays mounted.
    expect(hoverFilter("slug", null)).toEqual(["==", ["get", "slug"], ""]);
  });
});

describe("matchColor", () => {
  it("builds a Mapbox match expression over the mapping, with a fallback", () => {
    expect(matchColor("segment", mapping("A", "B"))).toEqual([
      "match",
      ["get", "segment"],
      "A",
      "#000000",
      "B",
      "#000001",
      HOVER_EMPHASIS.unmappedColor,
    ]);
  });
});
