/**
 * Copies data/transmission-lines.json to public/data/transmission-lines.json
 * so it can be fetched client-side without being bundled into the
 * Next.js pre-rendered page.
 */
import { copyFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const SRC = join(process.cwd(), "data", "transmission-lines.json");
const DEST_DIR = join(process.cwd(), "public", "data");
const DEST = join(DEST_DIR, "transmission-lines.json");

async function main() {
  // Skip gracefully if data file hasn't been synced yet
  try {
    await access(SRC);
  } catch {
    console.warn("⚠️  data/transmission-lines.json not found — skipping copy. Run npm run sync:transmission-lines first.");
    return;
  }

  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(SRC, DEST);
  console.log("✅ Copied transmission-lines.json to public/data/");
}

main().catch((err) => {
  console.error("Failed to copy transmission-lines.json:", err);
  process.exit(1);
});
