import type { FeatureCollection, Point } from "geojson";
import type { EVStation } from "@/types/ev-charging";

/** AFDC station coordinates are WGS84; GeoJSON uses longitude, latitude order. */
export function getEVStationHighlightGeoJSON(
  station: Pick<EVStation, "slug" | "stationName" | "latitude" | "longitude"> | null
): FeatureCollection<Point> | null {
  if (!station) return null;
  const { latitude, longitude } = station;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    return null;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { slug: station.slug, name: station.stationName },
        geometry: { type: "Point", coordinates: [longitude, latitude] },
      },
    ],
  };
}
