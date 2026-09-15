import type { FeatureCollection } from "geojson";

interface PowerPlantHighlightSource {
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Build the point GeoJSON used to highlight a power plant in Explore.
 *
 * The Explore map only pans when `state.highlightGeoJSON` changes, so the
 * power-plant detail panel needs a point feature, not just the selected slug.
 */
export function getPowerPlantHighlightGeoJSON(
  plant: PowerPlantHighlightSource | null | undefined
): FeatureCollection | null {
  if (!plant) return null;

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: plant.name },
        geometry: {
          type: "Point",
          coordinates: [plant.longitude, plant.latitude],
        },
      },
    ],
  };
}
