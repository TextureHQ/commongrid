/**
 * Copies data/ev-charging.json to public/data/ev-charging.json
 * so it can be fetched client-side without being bundled into the
 * Next.js pre-rendered page (which would exceed Vercel's ISR size limit).
 *
 * Skips gracefully if the source file doesn't exist (e.g., before first sync).
 */
import { copyFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const SRC = join(process.cwd(), "data", "ev-charging.json");
const DEST_DIR = join(process.cwd(), "public", "data");
const DEST = join(DEST_DIR, "ev-charging.json");

async function main() {
  // Skip if source doesn't exist yet (before first sync)
  try {
    await access(SRC);
  } catch {
    console.log("⚠️  data/ev-charging.json not found — skipping (run npm run sync:ev-charging first)");
    return;
  }

  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(SRC, DEST);
  console.log("✅ Copied ev-charging.json to public/data/");
}

main().catch((err) => {
  console.error("Failed to copy ev-charging.json:", err);
  process.exit(1);
});
