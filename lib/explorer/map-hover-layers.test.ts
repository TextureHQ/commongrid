import { describe, expect, it } from "vitest";
import {
  baseSourceId,
  buildHoverLayerConfigs,
  HOVER_EMPHASIS,
  type HoveredKeys,
  type HoverStyle,
  hoverFilter,
} from "./map-hover-layers";

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

const STYLE: HoverStyle = { color: "#ff00aa" };

const byId = (hovered: HoveredKeys = NOTHING_HOVERED, style: HoverStyle = STYLE) =>
  Object.fromEntries(buildHoverLayerConfigs(hovered, style).map((c) => [c.id, c]));

describe("buildHoverLayerConfigs", () => {
  it("reuses each base layer's source instead of declaring its own", () => {
    // Regression guard: highlights built as Edges layer specs declared a second
    // copy of the same tileset, which tripled tile requests on /explore.
    for (const cfg of buildHoverLayerConfigs(NOTHING_HOVERED, STYLE)) {
      expect(cfg.source).toBe(baseSourceId(cfg.base));
      expect(cfg).not.toHaveProperty("tileset");
    }
  });

  it("mirrors each base layer's minimum zoom so no tiles load earlier", () => {
    // A highlight with a lower minZoom than its base pulled tiles at zoom
    // levels where that layer isn't even shown.
    const layers = byId();
    expect(layers["territory-hover-outline"].minZoom).toBe(0);
    expect(layers["transmission-hover"].minZoom).toBe(3);
    expect(layers["power-plants-hover"].minZoom).toBe(5);
    expect(layers["substations-hover"].minZoom).toBe(5);
    expect(layers["ev-charging-hover"].minZoom).toBe(5);
    expect(layers["pricing-nodes-hover"].minZoom).toBe(3);
  });

  it("covers every hoverable layer, with unique ids that don't collide with base layers", () => {
    const configs = buildHoverLayerConfigs(NOTHING_HOVERED, STYLE);
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
    const layers = byId({ ...NOTHING_HOVERED, gridOperator: "ba:miso" });
    expect(layers["grid-hover"].hovered).toBe("ba:miso");
    expect(layers["transmission-hover"].hovered).toBeNull();
  });

  it("outlines the hovered territory only where the territories layer shows it", () => {
    // The outline used to be its own Edges spec, which fetched the territories
    // tiles a second time. It must also respect the base layer's filter
    // (segment, program results), or it would outline a hidden utility.
    const segmentOnly = ["==", ["get", "segment"], "COOPERATIVE"];
    const outline = byId({ ...NOTHING_HOVERED, territory: "pacificorp" }, { ...STYLE, territoryFilter: segmentOnly })[
      "territory-hover-outline"
    ];
    expect(outline.source).toBe("territories-source");
    expect(outline.hovered).toBe("pacificorp");
    expect(outline.baseFilter).toEqual(segmentOnly);
  });

  it("keys grid operators by kind + slug, not slug alone", () => {
    // Five ISOs share a slug with their balancing authority (caiso, ercot, …).
    expect(byId()["grid-hover"].keyProp).toBe("hoverKey");
  });

  it("outlines regions and lines in the highlight color, matching #535", () => {
    const layers = byId();
    for (const id of ["territory-hover-outline", "grid-hover", "program-hover", "transmission-hover"]) {
      expect(layers[id].type).toBe("line");
      expect(layers[id].paint["line-color"]).toBe(STYLE.color);
      expect(layers[id].paint["line-width"]).toBe(HOVER_EMPHASIS.outlineWidth);
    }
    expect(HOVER_EMPHASIS.outlineWidth).toBe(3);
    // Thicker than a base transmission line, so a hovered line still stands out.
    expect(HOVER_EMPHASIS.outlineWidth).toBeGreaterThan(1.5);
  });

  it("rings points without covering the dot inside", () => {
    const layers = byId();
    for (const id of ["power-plants-hover", "substations-hover", "ev-charging-hover", "pricing-nodes-hover"]) {
      expect(layers[id].type).toBe("circle");
      expect(layers[id].paint["circle-opacity"]).toBe(0);
      expect(layers[id].paint["circle-stroke-color"]).toBe(STYLE.color);
      expect(layers[id].paint["circle-stroke-width"]).toBe(HOVER_EMPHASIS.outlineWidth);
    }
    // Base dots are radius 3–4 plus a 1px ring: the ring's inner edge must clear 5.
    expect(HOVER_EMPHASIS.pointRingRadius - HOVER_EMPHASIS.outlineWidth / 2).toBeGreaterThan(5);
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
