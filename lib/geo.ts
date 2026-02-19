import type { FeatureCollection } from "geojson";

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

export function computeViewStateFromGeoJSON(geoJSON: FeatureCollection): ViewState | null {
  if (!geoJSON?.features?.length) return null;

  let minLng = 180;
  let maxLng = -180;
  let minLat = 90;
  let maxLat = -90;

  const processCoords = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lng, lat] = coords as [number, number];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) processCoords(c);
    }
  };

  for (const feature of geoJSON.features) {
    if (feature.geometry && "coordinates" in feature.geometry) {
      processCoords(feature.geometry.coordinates);
    }
  }

  const centerLng = (minLng + maxLng) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;
  const maxSpan = Math.max(lngSpan, latSpan);

  let zoom = 8;
  if (maxSpan > 20) zoom = 3;
  else if (maxSpan > 10) zoom = 4;
  else if (maxSpan > 5) zoom = 5;
  else if (maxSpan > 2) zoom = 6;
  else if (maxSpan > 1) zoom = 7;
  else if (maxSpan > 0.5) zoom = 8;
  else if (maxSpan > 0.2) zoom = 9;
  else zoom = 10;

  return { longitude: centerLng, latitude: centerLat, zoom };
}

export function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
