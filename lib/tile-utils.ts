/**
 * Maximum zoom level available in our PMTiles archives.
 * Tiles are built with tippecanoe at zoom 0–12.
 * When a request comes in for z > MAX_TILE_ZOOM, we resolve
 * the parent tile at MAX_TILE_ZOOM so mapbox-gl can overzoom it.
 */
export const MAX_TILE_ZOOM = 12;

/**
 * Resolve tile coordinates, clamping to MAX_TILE_ZOOM for overzooming.
 * When z > MAX_TILE_ZOOM, finds the ancestor tile at MAX_TILE_ZOOM
 * that contains the requested tile.
 */
export function resolveOverzoom(
  z: number,
  x: number,
  y: number,
): { z: number; x: number; y: number } {
  if (z <= MAX_TILE_ZOOM) {
    return { z, x, y };
  }

  // Shift the tile coordinates to the parent zoom level.
  // Each zoom level doubles the tile grid, so we right-shift
  // by the difference to find the ancestor tile.
  const shift = z - MAX_TILE_ZOOM;
  return {
    z: MAX_TILE_ZOOM,
    x: x >> shift,
    y: y >> shift,
  };
}
