/**
 * Copies data/pricing-nodes.json to public/data/pricing-nodes.json
 * so it can be fetched client-side without being bundled into the
 * Next.js pre-rendered page (which would exceed Vercel's ISR size limit).
 */
import { copyFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const SRC = join(process.cwd(), "data", "pricing-nodes.json");
const DEST_DIR = join(process.cwd(), "public", "data");
const DEST = join(DEST_DIR, "pricing-nodes.json");

async function main() {
  try {
    await access(SRC);
  } catch {
    console.log("⚠️  data/pricing-nodes.json not found — skipping (run npm run sync:pricing-nodes first)");
    return;
  }

  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(SRC, DEST);
  console.log("✅ Copied pricing-nodes.json to public/data/");
}

main().catch((err) => {
  console.error("Failed to copy pricing-nodes.json:", err);
  process.exit(1);
});
