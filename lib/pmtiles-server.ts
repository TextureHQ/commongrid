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

/** Bounds for a named PMTiles archive as [west, south, east, north]. */
export interface ArchiveBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Vector layer metadata extracted from a PMTiles archive. */
export interface ArchiveVectorLayer {
  id: string;
  fields: Record<string, "String" | "Number" | "Boolean">;
  description?: string;
}

/** PMTiles metadata we care about for TileJSON generation.
 *
 * NOTE: `name` and `description` are intentionally NOT included here.
 * Several archives carry stale "OpenGrid" names or a filesystem path in
 * their metadata, so public-facing layer titles come from the curated
 * registry in `lib/tiles/layer-registry.ts` instead.
 */
export interface ArchiveMetadata {
  minzoom: number;
  maxzoom: number;
  bounds: ArchiveBounds;
  vectorLayers: ArchiveVectorLayer[];
}

/**
 * Read archive-level metadata for TileJSON generation.
 *
 * Bounds come from the PMTiles header; vector layer schema comes from
 * `vector_layers` in the archive JSON metadata. This keeps the TileJSON
 * endpoints self-healing: if a tile rebuild changes field names or bounds,
 * the next TileJSON request reflects the actual archive contents.
 */
export async function getArchiveMetadata(name: string): Promise<ArchiveMetadata | null> {
  const pm = getArchive(name);
  const [header, metadata] = await Promise.all([pm.getHeader(), pm.getMetadata()]);

  const raw = metadata as Record<string, unknown>;
  const rawLayers = Array.isArray(raw.vector_layers) ? raw.vector_layers : [];
  const vectorLayers: ArchiveVectorLayer[] = rawLayers.map((layer: unknown) => {
    const l = layer as Record<string, unknown>;
    const fields: Record<string, unknown> =
      typeof l.fields === "object" && l.fields !== null ? (l.fields as Record<string, unknown>) : {};
    return {
      id: String(l.id ?? name),
      description: l.description ? String(l.description) : undefined,
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => {
          const normalized = String(value).toLowerCase();
          if (normalized === "number" || normalized === "float" || normalized === "integer") {
            return [key, "Number" as const];
          }
          if (normalized === "boolean" || normalized === "bool") {
            return [key, "Boolean" as const];
          }
          return [key, "String" as const];
        })
      ),
    };
  });

  return {
    minzoom: header.minZoom,
    maxzoom: header.maxZoom,
    bounds: {
      west: header.minLon,
      south: header.minLat,
      east: header.maxLon,
      north: header.maxLat,
    },
    vectorLayers,
  };
}

/**
 * Return every vector layer id in the archive.
 * Useful for callers that only need the layer name(s) without full metadata.
 */
export async function getArchiveVectorLayerIds(name: string): Promise<string[]> {
  const pm = getArchive(name);
  const metadata = (await pm.getMetadata()) as Record<string, unknown>;
  const rawLayers = Array.isArray(metadata.vector_layers) ? metadata.vector_layers : [];
  return rawLayers.map((raw) => String((raw as Record<string, unknown>).id ?? name));
}
