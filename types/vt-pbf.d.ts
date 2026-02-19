import type { Tile } from "geojson-vt";

declare module "vt-pbf" {
  interface TileLayer {
    features: unknown[];
  }

  interface TileLayers {
    [layerName: string]: Tile | TileLayer;
  }

  interface LayerOptions {
    version?: number;
    extent?: number;
  }

  export function fromGeojsonVt(layers: TileLayers, options?: LayerOptions): Uint8Array;
}
