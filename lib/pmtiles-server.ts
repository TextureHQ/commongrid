/**
 * Server-side PMTiles reader for Next.js API routes.
 *
 * Provides efficient random-access tile serving from .pmtiles archives.
 * Uses Node.js file handles with caching to avoid re-opening files per request.
 */
import { open, type FileHandle } from "node:fs/promises";
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
  return archiveCache.get(name)!;
}

/**
 * Fetch a single MVT tile from a named PMTiles archive.
 * Returns the raw tile bytes or null if the tile doesn't exist.
 */
export async function getTile(
  archive: string,
  z: number,
  x: number,
  y: number,
): Promise<ArrayBuffer | null> {
  const pm = getArchive(archive);
  const result = await pm.getZxy(z, x, y);
  return result ? result.data : null;
}
