import { describe, expect, it } from "vitest";
import { getPowerPlantHighlightGeoJSON } from "./power-plant-highlight";

describe("getPowerPlantHighlightGeoJSON", () => {
  it("returns a single point feature for the selected plant", () => {
    const geoJSON = getPowerPlantHighlightGeoJSON({
      name: "Test Plant",
      latitude: 44.25,
      longitude: -72.58,
    });

    expect(geoJSON).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Test Plant" },
          geometry: {
            type: "Point",
            coordinates: [-72.58, 44.25],
          },
        },
      ],
    });
  });

  it("returns null when there is no plant", () => {
    expect(getPowerPlantHighlightGeoJSON(null)).toBeNull();
    expect(getPowerPlantHighlightGeoJSON(undefined)).toBeNull();
  });
});
