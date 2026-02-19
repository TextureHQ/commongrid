/**
 * Pre-build script for Vercel deployment.
 * Copies data from the repo root into the explorer directory
 * so Next.js can resolve @/data/* imports and serve territory GeoJSON.
 */
import { cpSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoData = resolve(__dirname, "..", "data");
const explorerData = resolve(__dirname, "data");
const publicData = resolve(__dirname, "public", "data");

if (!existsSync(repoData)) {
  console.error("❌ Could not find repo data/ directory at:", repoData);
  process.exit(1);
}

console.log("📦 Copying data/ → explorer/data/");
cpSync(repoData, explorerData, { recursive: true });

console.log("📦 Copying data/ → explorer/public/data/");
mkdirSync(resolve(__dirname, "public"), { recursive: true });
cpSync(repoData, publicData, { recursive: true });

console.log("✅ Data setup complete");
