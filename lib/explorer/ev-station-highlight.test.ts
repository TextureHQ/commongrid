import { describe, expect, it } from "vitest";
import { getEVStationHighlightGeoJSON } from "./ev-station-highlight";

const station = { slug: "hudson-yards", stationName: "10 Hudson Yards", latitude: 40.752, longitude: -74.002 };

describe("EV station highlight", () => {
  it("uses longitude first and preserves station identity", () => {
    expect(getEVStationHighlightGeoJSON(station)?.features[0]).toEqual({
      type: "Feature",
      properties: { slug: station.slug, name: station.stationName },
      geometry: { type: "Point", coordinates: [-74.002, 40.752] },
    });
  });
  it("clears missing stations", () => expect(getEVStationHighlightGeoJSON(null)).toBeNull());
  it.each([NaN, Infinity, 91, -91, null, undefined])("rejects invalid latitude %s", (latitude) => {
    expect(getEVStationHighlightGeoJSON({ ...station, latitude: latitude as number })).toBeNull();
  });
  it.each([NaN, Infinity, 181, -181, null, undefined])("rejects invalid longitude %s", (longitude) => {
    expect(getEVStationHighlightGeoJSON({ ...station, longitude: longitude as number })).toBeNull();
  });
});
