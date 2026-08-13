/**
 * Server-side PMTiles reader for Next.js API routes.
 *
 * Provides efficient random-access tile serving from .pmtiles archives.
 * Uses Node.js file handles with caching to avoid re-opening files per request.
 */
import { type FileHandle, open } from "node:fs/promises";
import { join } from "node:path";
import { PMTiles } from "pmtiles";

/**
 * A PMTiles Source backed by a local file (Node.js fs).
 * The pmtiles library's built-in FileSource uses the browser File API,
 * so we need our own for server-side usage.
 */
class NodeFileSource {
  private fh: FileHandle | null = null;
  constructor(private filePath: string) {}

  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    if (!this.fh) {
      this.fh = await open(this.filePath, "r");
    }
    const buf = Buffer.alloc(length);
    await this.fh.read(buf, 0, length, offset);
    // Return a proper ArrayBuffer (not a shared Buffer backing store)
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }

  getKey(): string {
    return this.filePath;
  }
}

// Cache PMTiles instances across requests (module-level singleton).
// In serverless environments each instance lives for the function lifetime.
const archiveCache = new Map<string, PMTiles>();

function getArchive(name: string): PMTiles {
  if (!archiveCache.has(name)) {
    const filePath = join(process.cwd(), "public", "tiles", `${name}.pmtiles`);
    archiveCache.set(name, new PMTiles(new NodeFileSource(filePath)));
  }
  // biome-ignore lint/style/noNonNullAssertion: value was just set in the if-block above
  return archiveCache.get(name)!;
}

/**
 * Fetch a single MVT tile from a named PMTiles archive.
 * Returns the raw tile bytes or null if the tile doesn't exist.
 */
export async function getTile(archive: string, z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const pm = getArchive(archive);
  const result = await pm.getZxy(z, x, y);
  return result ? result.data : null;
}

/** A single vector layer described by an archive's embedded metadata. */
export interface ArchiveVectorLayer {
  id: string;
  fields: Record<string, string>;
  description?: string;
  minzoom?: number;
  maxzoom?: number;
}

/**
 * The factual, geometry-derived properties of a PMTiles archive.
 *
 * These describe what is physically inside the file, so they are read from the
 * archive rather than hardcoded — that way they follow tile regeneration
 * automatically. Editorial metadata (name/description/attribution) is
 * intentionally NOT read from here; see `lib/tiles/layer-registry.ts`.
 */
export interface ArchiveTileInfo {
  minzoom: number;
  maxzoom: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bounds: [number, number, number, number];
  /** [lon, lat, zoom] */
  center: [number, number, number];
  vectorLayers: ArchiveVectorLayer[];
}

/**
 * Read header + metadata from a PMTiles archive.
 *
 * The archive handle and its header are cached by the `pmtiles` library on the
 * instance we keep in `archiveCache`, so repeat calls do not re-read the file
 * from disk beyond the initial ranged reads.
 */
export async function getArchiveInfo(archive: string): Promise<ArchiveTileInfo> {
  const pm = getArchive(archive);
  const header = await pm.getHeader();
  const metadata = (await pm.getMetadata()) as { vector_layers?: ArchiveVectorLayer[] };

  return {
    minzoom: header.minZoom,
    maxzoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
    center: [header.centerLon, header.centerLat, header.centerZoom],
    vectorLayers: metadata.vector_layers ?? [],
  };
}
