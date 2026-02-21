/**
 * fix-remaining-logos.mjs
 *
 * Fetches logos for entities that still have dead logo.dev URLs.
 * Strategy (in priority order):
 *   1. Apple-touch-icon from company website (180x180 PNG)
 *   2. og:image from website homepage
 *   3. DuckDuckGo favicon ICO → PNG conversion
 *
 * Usage: node scripts/fix-remaining-logos.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOGOS_DIR = path.join(ROOT, "public", "logos");

const DATA_FILES = [
  "data/utilities.json",
  "data/rtos.json",
  "data/isos.json",
  "data/balancing-authorities.json",
];

const CONCURRENCY = 5;
const TIMEOUT_MS = 15_000;

// Convert dashed-domain format to real domain
// e.g. "pacificorp-com" → "pacificorp.com"
// e.g. "www.portlandgeneral-com" → "www.portlandgeneral.com"
// e.g. "seattle-gov" → "seattle.gov"
const KNOWN_TLDS = ["com", "gov", "org", "net", "coop", "edu", "us", "uk", "ca", "io", "co"];

function fixDomain(raw) {
  // Some domains already have dots (e.g. "www.portlandgeneral-com")
  // Replace the last -tld with .tld
  for (const tld of KNOWN_TLDS) {
    if (raw.endsWith(`-${tld}`)) {
      return raw.slice(0, -(tld.length + 1)) + "." + tld;
    }
  }
  // Already has a dot? Return as-is
  if (raw.includes(".")) return raw;
  return raw;
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryAppleTouchIcon(domain) {
  const urls = [
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon-precomposed.png`,
    `https://www.${domain}/apple-touch-icon.png`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("image")) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 500) return buf; // skip tiny files
        }
      }
    } catch {}
  }
  return null;
}

async function tryOgImage(domain) {
  const urls = [
    `https://${domain}`,
    `https://www.${domain}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OpenGrid/1.0)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Look for og:image
      const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (m) {
        let imgUrl = m[1];
        if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
        if (imgUrl.startsWith("/")) imgUrl = url + imgUrl;
        const imgRes = await fetchWithTimeout(imgUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length > 500) return buf;
        }
      }
    } catch {}
  }
  return null;
}

async function tryDDGFavicon(domain) {
  const url = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  try {
    const res = await fetchWithTimeout(url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100) return buf;
    }
  } catch {}
  return null;
}

async function tryFaviconFromPage(domain) {
  const urls = [`https://${domain}`, `https://www.${domain}`];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OpenGrid/1.0)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      // Look for <link rel="icon" ...> or <link rel="shortcut icon" ...>
      const iconRe = /<link[^>]+(rel=["'](icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']|href=["']([^"']+)["'][^>]+rel=["'](icon|shortcut icon|apple-touch-icon)["'])[^>]*>/gi;
      let best = null;
      let bestSize = 0;
      let m;
      while ((m = iconRe.exec(html)) !== null) {
        const href = m[3] || m[4];
        if (!href) continue;
        // Prefer larger icons
        const sizeM = m[0].match(/sizes=["'](\d+)x/i);
        const size = sizeM ? parseInt(sizeM[1]) : 16;
        if (size > bestSize) { bestSize = size; best = href; }
      }
      if (best) {
        let imgUrl = best;
        if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
        if (imgUrl.startsWith("/")) imgUrl = url + imgUrl;
        const imgRes = await fetchWithTimeout(imgUrl);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length > 100) return buf;
        }
      }
    } catch {}
  }
  return null;
}

// Detect image type from buffer magic bytes
function detectType(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.slice(0, 4).toString() === "GIF8") return "gif";
  if (buf.slice(0, 4).toString("hex") === "00000100") return "ico";
  if (buf.slice(0, 5).toString() === "<?xml" || buf.slice(0, 4).toString() === "<svg") return "svg";
  if (buf.slice(0, 5).toString() === "RIFF ") return "webp";
  return "unknown";
}

function saveImage(buf, destPath) {
  const type = detectType(buf);
  if (type === "ico") {
    // Save as .ico then convert to PNG using sips (macOS)
    const tmpIco = destPath.replace(".png", ".tmp.ico");
    fs.writeFileSync(tmpIco, buf);
    try {
      execSync(`sips -s format png "${tmpIco}" --out "${destPath}" 2>/dev/null`, { stdio: "pipe" });
    } catch {
      // If sips fails, just copy the file as-is
      fs.copyFileSync(tmpIco, destPath);
    }
    fs.unlinkSync(tmpIco);
  } else {
    fs.writeFileSync(destPath, buf);
  }
}

// Main
fs.mkdirSync(LOGOS_DIR, { recursive: true });

const tasks = [];
const fileContents = {};

for (const relFile of DATA_FILES) {
  const filePath = path.join(ROOT, relFile);
  if (!fs.existsSync(filePath)) continue;
  fileContents[relFile] = JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const pendingItems = [];

for (const [relFile, entities] of Object.entries(fileContents)) {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    const logo = e.logo || "";
    if (!logo.includes("logo.dev")) continue;
    const slug = e.slug || e.id;
    if (!slug) continue;

    const destPath = path.join(LOGOS_DIR, `${slug}.png`);
    if (fs.existsSync(destPath)) continue; // already downloaded

    // Extract domain from URL
    const m = logo.match(/logo\.dev\/([^?]+)\?/);
    const rawDomain = m ? m[1] : "";
    const domain = fixDomain(rawDomain);

    pendingItems.push({ relFile, idx: i, slug, rawDomain, domain, destPath });
  }
}

console.log(`Found ${pendingItems.length} logos to fetch`);

const results = { success: 0, failed: 0, failedSlugs: [] };

async function processItem(item) {
  const { slug, domain, destPath } = item;
  
  let buf = null;

  // Strategy 1: Apple touch icon
  buf = await tryAppleTouchIcon(domain);
  if (buf) {
    console.log(`  [ATI] ${slug} (${domain})`);
    saveImage(buf, destPath);
    return true;
  }

  // Strategy 2: OG image from page
  buf = await tryOgImage(domain);
  if (buf) {
    console.log(`  [OGI] ${slug} (${domain})`);
    saveImage(buf, destPath);
    return true;
  }

  // Strategy 3: Favicon from HTML
  buf = await tryFaviconFromPage(domain);
  if (buf) {
    console.log(`  [FAV] ${slug} (${domain})`);
    saveImage(buf, destPath);
    return true;
  }

  // Strategy 4: DuckDuckGo favicon
  buf = await tryDDGFavicon(domain);
  if (buf) {
    console.log(`  [DDG] ${slug} (${domain})`);
    saveImage(buf, destPath);
    return true;
  }

  console.log(`  [FAIL] ${slug} (${domain})`);
  return false;
}

async function runConcurrent(items, concurrency) {
  let index = 0;
  const total = items.length;
  let done = 0;

  async function worker() {
    while (index < total) {
      const item = items[index++];
      const ok = await processItem(item);
      if (ok) {
        results.success++;
        // Update JSON in-memory
        fileContents[item.relFile][item.idx].logo = `/logos/${item.slug}.png`;
      } else {
        results.failed++;
        results.failedSlugs.push(item.slug);
      }
      done++;
      if (done % 10 === 0 || done === total) {
        process.stdout.write(`\r  Progress: ${done}/${total} (${results.success} ok, ${results.failed} failed)   `);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  process.stdout.write("\n");
}

await runConcurrent(pendingItems, CONCURRENCY);

// Write updated JSON files
console.log("\nWriting updated JSON files...");
for (const [relFile, entities] of Object.entries(fileContents)) {
  const filePath = path.join(ROOT, relFile);
  fs.writeFileSync(filePath, JSON.stringify(entities, null, 2) + "\n");
}

console.log(`\n✓ Done: ${results.success} logos saved, ${results.failed} failed`);
if (results.failedSlugs.length > 0) {
  console.log("\nFailed slugs:");
  results.failedSlugs.forEach(s => console.log(`  - ${s}`));
}
