/**
 * Copies data/utilities.json to public/data/utilities.json
 * so it can be fetched client-side without being bundled into the
 * Next.js JavaScript bundle (which was causing 15-20s load times).
 */
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const SRC = join(process.cwd(), "data", "utilities.json");
const DEST_DIR = join(process.cwd(), "public", "data");
const DEST = join(DEST_DIR, "utilities.json");

async function main() {
  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(SRC, DEST);
  console.log("✅ Copied utilities.json to public/data/");
}

main().catch((err) => {
  console.error("Failed to copy utilities.json:", err);
  process.exit(1);
});
