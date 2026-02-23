/**
 * Copies data/power-plants.json to public/data/power-plants.json
 * so it can be fetched client-side without being bundled into the
 * Next.js pre-rendered page (which would exceed Vercel's ISR size limit).
 */
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const SRC = join(process.cwd(), "data", "power-plants.json");
const DEST_DIR = join(process.cwd(), "public", "data");
const DEST = join(DEST_DIR, "power-plants.json");

async function main() {
  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(SRC, DEST);
  console.log("✅ Copied power-plants.json to public/data/");
}

main().catch((err) => {
  console.error("Failed to copy power-plants.json:", err);
  process.exit(1);
});
