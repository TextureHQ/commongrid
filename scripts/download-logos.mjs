/**
 * download-logos.mjs
 *
 * One-time script to:
 *  1. Find every logo.dev URL in the entity data files
 *  2. Download each image to public/logos/<slug>.png
 *  3. Rewrite the JSON files so logo fields point to /logos/<slug>.png
 *
 * Usage:  node scripts/download-logos.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOGOS_DIR = path.join(ROOT, "public", "logos");
const CONCURRENCY = 20; // parallel downloads

const DATA_FILES = [
  "data/utilities.json",
  "data/rtos.json",
  "data/isos.json",
  "data/balancing-authorities.json",
];

// ── helpers ────────────────────────────────────────────────────────────────

async function downloadImage(url, destPath) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

async function runConcurrent(tasks, concurrency) {
  let index = 0;
  let done = 0;
  const total = tasks.length;

  async function worker() {
    while (index < total) {
      const task = tasks[index++];
      try {
        await task();
      } catch (err) {
        // errors already logged inside tasks
      }
      done++;
      if (done % 100 === 0 || done === total) {
        process.stdout.write(`\r  Progress: ${done}/${total}   `);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  process.stdout.write("\n");
}

// ── main ───────────────────────────────────────────────────────────────────

fs.mkdirSync(LOGOS_DIR, { recursive: true });

const mapping = []; // { file, idx, slug, oldUrl, newPath }

for (const relFile of DATA_FILES) {
  const filePath = path.join(ROOT, relFile);
  const entities = JSON.parse(fs.readFileSync(filePath, "utf8"));

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e.logo || !e.logo.includes("logo.dev")) continue;

    const slug = e.slug || e.id;
    if (!slug) {
      console.warn(`[SKIP] No slug/id for entity in ${relFile}:`, e.name);
      continue;
    }

    mapping.push({
      file: relFile,
      idx: i,
      slug,
      oldUrl: e.logo,
      localPath: `/logos/${slug}.png`,
      destPath: path.join(LOGOS_DIR, `${slug}.png`),
    });
  }
}

console.log(`Found ${mapping.length} logo.dev references across all data files`);

// Deduplicate by destPath so we only download each file once,
// but we still update *all* JSON entries.
const byDest = new Map();
for (const item of mapping) {
  if (!byDest.has(item.destPath)) byDest.set(item.destPath, item);
}

const uniqueDownloads = [...byDest.values()];
console.log(`Unique logo files to download: ${uniqueDownloads.length}`);

const errors = [];

const tasks = uniqueDownloads.map((item) => async () => {
  // Skip if already downloaded
  if (fs.existsSync(item.destPath)) return;
  try {
    await downloadImage(item.oldUrl, item.destPath);
  } catch (err) {
    errors.push({ item, err: err.message });
    // Leave a note so we can see what failed
    console.error(`\n  [ERR] ${item.slug}: ${err.message}`);
  }
});

console.log(`Downloading with concurrency=${CONCURRENCY}…`);
await runConcurrent(tasks, CONCURRENCY);

if (errors.length) {
  console.warn(`\n⚠️  ${errors.length} downloads failed (see above)`);
}

// ── Update JSON files ───────────────────────────────────────────────────────

console.log("\nUpdating JSON data files…");

// Load all files fresh, apply all mapping updates, write back
const fileContents = {};
for (const relFile of DATA_FILES) {
  const filePath = path.join(ROOT, relFile);
  fileContents[relFile] = JSON.parse(fs.readFileSync(filePath, "utf8"));
}

let updated = 0;
for (const item of mapping) {
  // Only update if the download succeeded (file exists)
  if (!fs.existsSync(item.destPath)) continue;
  fileContents[item.file][item.idx].logo = item.localPath;
  updated++;
}

for (const [relFile, entities] of Object.entries(fileContents)) {
  const filePath = path.join(ROOT, relFile);
  fs.writeFileSync(filePath, JSON.stringify(entities, null, 2) + "\n");
}

console.log(`Updated ${updated} logo references across ${DATA_FILES.length} files`);

// ── Print mapping summary ───────────────────────────────────────────────────

const summaryPath = path.join(ROOT, "scripts", "logo-mapping.json");
const summaryData = mapping.map(({ slug, oldUrl, localPath }) => ({
  slug,
  oldUrl,
  newPath: localPath,
}));
fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2) + "\n");
console.log(`\nMapping written to scripts/logo-mapping.json`);
console.log("Done! ✓");
