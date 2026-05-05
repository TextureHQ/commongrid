/**
 * Sync script: Download US electric substations.
 *
 * Sources:
 *   1. OpenStreetMap `power=substation` via Overpass API — primary, broadest US coverage.
 *      Licensed under ODbL: attribution required. Provenance carried in `osmId` and `sourceUrl`.
 *   2. EIA `U.S. Electric Substations` ArcGIS FeatureServer (public domain) — optional
 *      augmentation when `EIA_SUBSTATIONS_URL` is set. Used for cross-validation and
 *      gap-filling.  HIFLD's legacy feed was secured in April 2023 and is no longer
 *      available publicly.
 *
 * Default policy (set via flags / env, see FLAGS below):
 *   • Drop sub-69 kV distribution-only substations (not bulk-power-relevant).
 *   • Carry ODbL attribution for every OSM-derived row.
 *   • Emit HIFLD legacy-name mismatches to an audit CSV — non-blocking.
 *
 * Usage:
 *   cd commongrid
 *   npx tsx scripts/sync-substations.ts            # full US sync
 *   STATES=VT,NH npx tsx scripts/sync-substations.ts   # subset (debug / smoke test)
 *
 * Output:
 *   data/substations.json                       — metadata list (list/search)
 *   data/substations.geojson                    — FeatureCollection for tippecanoe
 *   data/substations-hifld-mismatches.csv       — audit of unmatched legacy names
 *
 * References:
 *   • EIA dataset: https://atlas.eia.gov/datasets/eia::u-s-electric-substations
 *   • Overpass API: https://overpass-api.de/
 *   • OSM power=substation wiki: https://wiki.openstreetmap.org/wiki/Tag:power%3Dsubstation
 *   • ODbL: https://opendatacommons.org/licenses/odbl/1-0/
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  SubstationRecord,
  SubstationSource,
  SubstationStatus,
  SubstationType,
  VoltageBand,
} from "../types/substations";

// ── Constants / flags ───────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");
const OUT_JSON = path.join(DATA_DIR, "substations.json");
const OUT_GEOJSON = path.join(DATA_DIR, "substations.geojson");
const OUT_MISMATCH_CSV = path.join(DATA_DIR, "substations-hifld-mismatches.csv");

const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const EIA_SUBSTATIONS_URL = process.env.EIA_SUBSTATIONS_URL ?? null;
const EIA_BATCH_SIZE = 1000;

/** Minimum max voltage (kV) to include. Sub-69 kV is distribution-only by convention. */
const MIN_VOLTAGE_KV = Number(process.env.MIN_VOLTAGE_KV ?? 69);

/** Optional state filter (comma-separated 2-letter codes). */
const STATE_FILTER = (process.env.STATES ?? "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

/** ISO 3166-2:US subdivision codes (50 states + DC). */
const US_STATES: string[] = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSlug(name: string, state: string, id: string): string {
  const base = [slugify(name || "substation"), state.toLowerCase()].filter(Boolean).join("-");
  // id suffix guarantees uniqueness without expensive dedupe bookkeeping
  const idSuffix = slugify(id).slice(0, 16);
  return idSuffix ? `${base}-${idSuffix}` : base;
}

function classifyVoltage(maxKv: number | null): VoltageBand {
  if (maxKv == null || maxKv <= 0) return "unknown";
  if (maxKv >= 345) return "extra-high";
  if (maxKv >= 230) return "high";
  if (maxKv >= 115) return "medium";
  if (maxKv >= 69) return "sub-trans";
  return "unknown";
}

/**
 * Parse an OSM `voltage` tag. OSM records volts (often in scientific notation or
 * semicolon-separated lists like `115000;230000`). Returns the [min, max] in kV.
 */
function parseOsmVoltage(tag: string | undefined): { min: number | null; max: number | null } {
  if (!tag) return { min: null, max: null };
  const parts = tag
    .split(/[;,/]/)
    .map((v) => v.trim())
    .filter(Boolean);
  const kvs: number[] = [];
  for (const p of parts) {
    // handle "132 kV" style or pure numeric volts
    const kvMatch = p.match(/([\d.]+)\s*kv/i);
    if (kvMatch) {
      const kv = Number(kvMatch[1]);
      if (Number.isFinite(kv)) kvs.push(kv);
      continue;
    }
    const n = Number(p.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    // assume volts when > 1000 — convert to kV; otherwise already kV
    kvs.push(n > 1000 ? n / 1000 : n);
  }
  if (kvs.length === 0) return { min: null, max: null };
  return {
    min: Math.round(Math.min(...kvs)),
    max: Math.round(Math.max(...kvs)),
  };
}

/**
 * Map OSM `substation=*` tag to our internal substation_type enum.
 * https://wiki.openstreetmap.org/wiki/Tag:power%3Dsubstation
 */
function parseSubstationType(tag: string | undefined): SubstationType {
  if (!tag) return "unknown";
  const t = tag.toLowerCase();
  if (t === "transmission" || t === "traction" || t === "converter") return "transmission";
  if (t === "distribution" || t === "minor_distribution") return "distribution";
  if (t === "industrial" || t === "switching" || t === "substation") return "hybrid";
  return "unknown";
}

function inferStatus(tags: Record<string, string>): SubstationStatus {
  const lifecycle = (tags["disused:power"] || tags["abandoned:power"] || "").toLowerCase();
  if (lifecycle) return lifecycle === "yes" ? "retired" : "out_of_service";
  if ((tags["construction:power"] || "").toLowerCase()) return "planned";
  return "in_service";
}

function preferOwner(tags: Record<string, string>): string | null {
  return tags.operator?.trim() || tags["operator:short"]?.trim() || tags.owner?.trim() || null;
}

// ── Overpass fetch (per-state) ──────────────────────────────────────────────

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OsmResponse {
  elements: OsmElement[];
}

async function fetchOverpassState(stateCode: string, attempt = 0): Promise<OsmElement[]> {
  const query = `
[out:json][timeout:180];
area["ISO3166-2"="US-${stateCode}"]->.searchArea;
(
  node["power"="substation"](area.searchArea);
  way["power"="substation"](area.searchArea);
  relation["power"="substation"](area.searchArea);
);
out center tags;
`.trim();

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "commongrid-sync/1.0 (+https://commongrid.info)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if ((res.status === 429 || res.status === 504) && attempt < 3) {
    const waitMs = 5000 * (attempt + 1) ** 2;
    console.log(`   [${res.status}] Overpass throttled for US-${stateCode}, retrying in ${waitMs / 1000}s…`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchOverpassState(stateCode, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status} for US-${stateCode}: ${await res.text()}`);
  }

  const body = (await res.json()) as OsmResponse;
  return body.elements ?? [];
}

function osmElementToRecord(e: OsmElement, stateCode: string): SubstationRecord | null {
  const tags = e.tags ?? {};
  if (tags.power !== "substation") return null;

  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const { min, max } = parseOsmVoltage(tags.voltage);
  const substationType = parseSubstationType(tags.substation);

  const name = (tags.name ?? `Substation ${e.id}`).trim();
  const osmId = `${e.type}/${e.id}`;
  const id = `osm-${e.type}-${e.id}`;

  return {
    id,
    slug: buildSlug(name, stateCode, osmId),
    name,
    ownerName: preferOwner(tags),
    state: stateCode,
    county: tags["addr:county"] ?? null,
    latitude: lat as number,
    longitude: lon as number,
    minVoltageKv: min,
    maxVoltageKv: max,
    voltageBand: classifyVoltage(max),
    substationType,
    status: inferStatus(tags),
    source: "osm" as SubstationSource,
    sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    eiaId: null,
    osmId,
    hifldLegacyId: null,
  };
}

// ── EIA FeatureServer (optional) ────────────────────────────────────────────

interface EiaFeature {
  type: "Feature";
  id?: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface EiaFeatureCollection {
  type: "FeatureCollection";
  properties?: { exceededTransferLimit?: boolean };
  features: EiaFeature[];
}

async function fetchEiaBatch(baseUrl: string, offset: number): Promise<EiaFeatureCollection> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    f: "geojson",
    resultRecordCount: String(EIA_BATCH_SIZE),
    resultOffset: String(offset),
    orderByFields: "OBJECTID",
  });
  const url = `${baseUrl.replace(/\/$/, "")}/query?${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "commongrid-sync/1.0 (+https://commongrid.info)" },
  });
  if (!res.ok) {
    throw new Error(`EIA HTTP ${res.status} at offset ${offset}: ${await res.text()}`);
  }
  return (await res.json()) as EiaFeatureCollection;
}

function pickProp(props: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = props[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function eiaFeatureToRecord(f: EiaFeature): SubstationRecord | null {
  const [lon, lat] = f.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const p = f.properties ?? {};
  const state = (pickProp(p, ["STATE", "State", "state"]) ?? "").toUpperCase().slice(0, 2);
  if (!state) return null;

  const name = pickProp(p, ["NAME", "Name", "SUB_NAME", "name"]) ?? `EIA Substation ${f.id ?? ""}`.trim();
  const eiaId = pickProp(p, ["ID", "OBJECTID", "EIA_ID", "SUB_ID"]);
  const ownerName = pickProp(p, ["OWNER", "OPERATOR", "Utility", "UTILITY"]);
  const county = pickProp(p, ["COUNTY", "County", "county"]);
  const maxRaw = pickProp(p, ["MAX_VOLT", "MAX_VOLTAGE", "VOLTAGE"]);
  const minRaw = pickProp(p, ["MIN_VOLT", "MIN_VOLTAGE"]);
  const typeRaw = pickProp(p, ["TYPE", "SUB_TYPE"])?.toLowerCase() ?? "";
  const statusRaw = pickProp(p, ["STATUS"])?.toLowerCase() ?? "";

  const maxKv = maxRaw ? Number(maxRaw) || null : null;
  const minKv = minRaw ? Number(minRaw) || null : null;

  const substationType: SubstationType = typeRaw.includes("trans")
    ? "transmission"
    : typeRaw.includes("dist")
      ? "distribution"
      : typeRaw
        ? "hybrid"
        : "unknown";

  const status: SubstationStatus = statusRaw.includes("retired")
    ? "retired"
    : statusRaw.includes("out")
      ? "out_of_service"
      : statusRaw.includes("plan")
        ? "planned"
        : statusRaw.includes("service")
          ? "in_service"
          : "unknown";

  const idKey = eiaId ?? String(f.id ?? `${lat.toFixed(4)}-${lon.toFixed(4)}`);
  return {
    id: `eia-${idKey}`,
    slug: buildSlug(name, state, idKey),
    name,
    ownerName,
    state,
    county,
    latitude: lat,
    longitude: lon,
    minVoltageKv: minKv,
    maxVoltageKv: maxKv,
    voltageBand: classifyVoltage(maxKv),
    substationType,
    status,
    source: "eia" as SubstationSource,
    sourceUrl: "https://atlas.eia.gov/datasets/eia::u-s-electric-substations",
    eiaId: idKey,
    osmId: null,
    hifldLegacyId: null,
  };
}

async function fetchAllEia(baseUrl: string): Promise<SubstationRecord[]> {
  console.log(`   Fetching EIA substations from ${baseUrl}`);
  const out: SubstationRecord[] = [];
  let offset = 0;
  let batch = 0;
  while (true) {
    batch++;
    process.stdout.write(`   batch ${batch} (offset ${offset})… `);
    const response = await fetchEiaBatch(baseUrl, offset);
    const feats = response.features ?? [];
    process.stdout.write(`${feats.length} features\n`);
    for (const f of feats) {
      const rec = eiaFeatureToRecord(f);
      if (rec) out.push(rec);
    }
    const exceeded = response.properties?.exceededTransferLimit ?? false;
    if (!exceeded || feats.length < EIA_BATCH_SIZE) break;
    offset += feats.length;
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}

// ── Entity resolution ───────────────────────────────────────────────────────

/**
 * Merge EIA and OSM records spatially. EIA wins when both exist within ~250 m
 * (≈ the footprint of a mid-sized substation yard). OSM fills every gap.
 *
 * Records whose preserved counterpart exists get `source = "hybrid"` and carry
 * both `eiaId` + `osmId`.
 */
function resolveSpatialMerge(eia: SubstationRecord[], osm: SubstationRecord[]): SubstationRecord[] {
  if (eia.length === 0) return osm;
  if (osm.length === 0) return eia;

  const MERGE_METERS = 250;
  // Rough meters-per-degree at mid-latitudes (fine for this tolerance).
  const M_PER_DEG = 111_000;
  const tolDeg = MERGE_METERS / M_PER_DEG;

  // Bucket EIA by a coarse grid keyed on 0.01° (≈1.1 km) cell
  const cellSize = 0.01;
  const grid = new Map<string, SubstationRecord[]>();
  const key = (lat: number, lon: number) => `${Math.round(lat / cellSize)}:${Math.round(lon / cellSize)}`;

  for (const e of eia) {
    const k = key(e.latitude, e.longitude);
    const cell = grid.get(k) ?? [];
    cell.push(e);
    grid.set(k, cell);
  }

  const merged: SubstationRecord[] = [...eia];
  const claimed = new Set<string>();

  for (const o of osm) {
    let best: { rec: SubstationRecord; d2: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${Math.round(o.latitude / cellSize) + dy}:${Math.round(o.longitude / cellSize) + dx}`;
        const cell = grid.get(k);
        if (!cell) continue;
        for (const e of cell) {
          if (claimed.has(e.id)) continue;
          const dLat = e.latitude - o.latitude;
          const dLon = e.longitude - o.longitude;
          if (Math.abs(dLat) > tolDeg || Math.abs(dLon) > tolDeg) continue;
          const d2 = dLat * dLat + dLon * dLon;
          if (!best || d2 < best.d2) best = { rec: e, d2 };
        }
      }
    }

    if (best) {
      // Merge OSM provenance + fill-ins into the EIA record
      claimed.add(best.rec.id);
      best.rec.source = "hybrid";
      best.rec.osmId = o.osmId;
      best.rec.ownerName = best.rec.ownerName ?? o.ownerName;
      best.rec.county = best.rec.county ?? o.county;
      if (best.rec.maxVoltageKv == null && o.maxVoltageKv != null) {
        best.rec.maxVoltageKv = o.maxVoltageKv;
        best.rec.minVoltageKv = o.minVoltageKv;
        best.rec.voltageBand = classifyVoltage(o.maxVoltageKv);
      }
      if (best.rec.substationType === "unknown") best.rec.substationType = o.substationType;
    } else {
      merged.push(o);
    }
  }
  return merged;
}

// ── HIFLD legacy-name reconciliation ────────────────────────────────────────

interface TLRow {
  sub1?: string;
  sub2?: string;
  id?: string;
}

/**
 * Collect distinct non-placeholder substation names from transmission-lines.json,
 * attempt a simple uppercase-trimmed match, stamp `hifldLegacyId` on hits, and
 * return the list of unmatched names (for the audit CSV).
 */
function reconcileHifldLegacy(records: SubstationRecord[]): { unmatched: string[] } {
  const tlPath = path.join(DATA_DIR, "transmission-lines.json");
  if (!fs.existsSync(tlPath)) {
    console.log("   transmission-lines.json not found — skipping HIFLD reconciliation.");
    return { unmatched: [] };
  }

  const tl: TLRow[] = JSON.parse(fs.readFileSync(tlPath, "utf8"));
  const PLACEHOLDER = new Set(["", "NOT AVAILABLE", "UNKNOWN", "N/A", "NA", "NONE"]);
  const legacyNames = new Set<string>();
  for (const row of tl) {
    for (const n of [row.sub1, row.sub2]) {
      if (!n) continue;
      const up = n.trim().toUpperCase();
      if (!PLACEHOLDER.has(up)) legacyNames.add(up);
    }
  }
  console.log(`   HIFLD legacy distinct names: ${legacyNames.size.toLocaleString()}`);

  // Build a name index over our records (name per state, upper-cased, trimmed)
  const byName = new Map<string, SubstationRecord[]>();
  for (const r of records) {
    const k = r.name.trim().toUpperCase();
    const list = byName.get(k) ?? [];
    list.push(r);
    byName.set(k, list);
  }

  const unmatched: string[] = [];
  let matched = 0;
  for (const legacy of legacyNames) {
    const direct = byName.get(legacy);
    // Also try with/without common suffixes like " SUBSTATION", " STATION", " SS"
    const stripped = legacy.replace(/\s+(SUBSTATION|STATION|SS|SUB)$/, "").trim();
    const hits = direct ?? byName.get(stripped);
    if (hits && hits.length > 0) {
      matched++;
      for (const h of hits) {
        if (!h.hifldLegacyId) h.hifldLegacyId = legacy;
      }
    } else {
      unmatched.push(legacy);
    }
  }

  console.log(
    `   HIFLD match rate: ${matched.toLocaleString()} / ${legacyNames.size.toLocaleString()} ` +
      `(${((matched / Math.max(legacyNames.size, 1)) * 100).toFixed(1)}%) — ${unmatched.length.toLocaleString()} unmatched`
  );
  return { unmatched };
}

function writeMismatchCsv(unmatched: string[]): void {
  const header = "legacy_name\n";
  const body = unmatched.map((n) => `"${n.replace(/"/g, '""')}"`).join("\n");
  fs.writeFileSync(OUT_MISMATCH_CSV, header + body + (body ? "\n" : ""));
  const sizeKb = (fs.statSync(OUT_MISMATCH_CSV).size / 1024).toFixed(1);
  console.log(`   ✅ ${OUT_MISMATCH_CSV} (${sizeKb} KB, ${unmatched.length.toLocaleString()} rows)`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔌 Syncing US electric substations…");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const states = STATE_FILTER.length ? STATE_FILTER : US_STATES;
  console.log(`   States: ${states.length === US_STATES.length ? "all 50 + DC" : states.join(",")}`);
  console.log(`   Min voltage (max kV): ${MIN_VOLTAGE_KV} kV — sub-threshold dropped as distribution-only`);

  // 1. OSM (primary) ---------------------------------------------------------
  console.log("\n1. OpenStreetMap (Overpass) — ODbL attribution carried per row");
  const osmRecords: SubstationRecord[] = [];
  let osmStateCount = 0;
  for (const st of states) {
    osmStateCount++;
    process.stdout.write(`   [${osmStateCount}/${states.length}] US-${st}… `);
    try {
      const elements = await fetchOverpassState(st);
      let kept = 0;
      for (const el of elements) {
        const rec = osmElementToRecord(el, st);
        if (rec) {
          osmRecords.push(rec);
          kept++;
        }
      }
      process.stdout.write(`${kept} kept\n`);
    } catch (err) {
      console.error(`\n   ⚠️ US-${st} failed: ${(err as Error).message}`);
    }
    // Polite delay — Overpass is a free community service.
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`   OSM total: ${osmRecords.length.toLocaleString()}`);

  // 2. EIA (optional) --------------------------------------------------------
  console.log("\n2. EIA U.S. Electric Substations (ArcGIS FeatureServer)");
  let eiaRecords: SubstationRecord[] = [];
  if (EIA_SUBSTATIONS_URL) {
    eiaRecords = await fetchAllEia(EIA_SUBSTATIONS_URL);
    console.log(`   EIA total: ${eiaRecords.length.toLocaleString()}`);
  } else {
    console.log("   Skipped: EIA_SUBSTATIONS_URL env var not set — OSM-only sync.");
    console.log(
      "   ℹ️  EIA's public feed is exposed through the atlas.eia.gov Hub site; the underlying\n" +
        "      ArcGIS FeatureServer URL can change. Once the stable FeatureServer endpoint\n" +
        "      is confirmed, export it as EIA_SUBSTATIONS_URL and re-run to augment OSM."
    );
  }

  // 3. Merge -----------------------------------------------------------------
  console.log("\n3. Spatial merge (EIA primary where present, OSM fills gaps)…");
  let merged = resolveSpatialMerge(eiaRecords, osmRecords);
  console.log(`   Merged total: ${merged.length.toLocaleString()}`);

  // 4. Voltage filter (drop sub-69 kV distribution-only) ---------------------
  const preFilter = merged.length;
  merged = merged.filter((r) => {
    // Unknown voltage is kept IFF substationType suggests transmission/hybrid
    if (r.maxVoltageKv == null) {
      return r.substationType !== "distribution";
    }
    return r.maxVoltageKv >= MIN_VOLTAGE_KV;
  });
  console.log(
    `   Voltage filter dropped ${(preFilter - merged.length).toLocaleString()} distribution-only rows (< ${MIN_VOLTAGE_KV} kV)`
  );

  // 5. HIFLD legacy-name reconciliation --------------------------------------
  console.log("\n4. HIFLD legacy-name reconciliation");
  const { unmatched } = reconcileHifldLegacy(merged);

  // 6. Sort + write ----------------------------------------------------------
  merged.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));

  console.log("\n5. Writing output…");
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(merged)}\n`);
  const jsonSize = (fs.statSync(OUT_JSON).size / 1024 / 1024).toFixed(2);
  console.log(`   ✅ ${OUT_JSON} (${jsonSize} MB, ${merged.length.toLocaleString()} rows)`);

  const features = merged.map((r) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [r.longitude, r.latitude] },
    properties: {
      id: r.id,
      slug: r.slug,
      name: r.name,
      state: r.state,
      ownerName: r.ownerName,
      minVoltageKv: r.minVoltageKv,
      maxVoltageKv: r.maxVoltageKv,
      voltageBand: r.voltageBand,
      substationType: r.substationType,
      status: r.status,
      source: r.source,
    },
  }));
  fs.writeFileSync(OUT_GEOJSON, JSON.stringify({ type: "FeatureCollection", features }));
  const geoSize = (fs.statSync(OUT_GEOJSON).size / 1024 / 1024).toFixed(2);
  console.log(`   ✅ ${OUT_GEOJSON} (${geoSize} MB)`);

  writeMismatchCsv(unmatched);

  // 7. Summary ---------------------------------------------------------------
  const bySource = new Map<string, number>();
  const byBand = new Map<string, number>();
  const byState = new Map<string, number>();
  for (const r of merged) {
    bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
    byBand.set(r.voltageBand, (byBand.get(r.voltageBand) ?? 0) + 1);
    byState.set(r.state, (byState.get(r.state) ?? 0) + 1);
  }

  console.log("\n📈 By source:");
  for (const [k, v] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v.toLocaleString()}`);
  }
  console.log("\n📈 By voltage band:");
  for (const [k, v] of [...byBand.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v.toLocaleString()}`);
  }
  console.log("\n📈 Top 10 states:");
  for (const [st, c] of [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${st}: ${c.toLocaleString()}`);
  }

  console.log("\n✅ Sync complete.");
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
