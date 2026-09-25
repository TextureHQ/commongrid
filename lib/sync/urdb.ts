import type { SyncRecord } from "./apply-sync";

export const URDB_SOURCE_ID = "openei-urdb";
export const URDB_DOWNLOAD_URL = "https://openei.org/apps/USURDB/download/usurdb.json.gz";
export const URDB_ATTRIBUTION = {
  title: "Utility Rate Database (URDB)",
  creators: ["Daniel Zimny-Schmitt", "Jay Huggins"],
  publisher: "National Renewable Energy Laboratory (NREL)",
  distributor: "Open Energy Data Initiative (OEDI) / OpenEI",
  datasetUrl: "https://data.openei.org/submissions/5",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  changes:
    "CommonGrid extracts searchable metadata and links utilities by unique EIA ID; the upstream structured record is retained without reinterpretation.",
  disclaimer:
    "No endorsement implied. Imported schedules are not independently verified current or evidence of household eligibility. Linked utility documents have separate rights.",
} as const;

export interface UrdbUtility {
  id: string;
  eiaId: string | null;
}
type RawRecord = Record<string, unknown>;

function object(value: unknown): value is RawRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Accept the published JSON collection and line-delimited exports; never silently skip errors. */
export function parseUrdb(text: string): RawRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }
  const rows = Array.isArray(parsed) ? parsed : object(parsed) ? parsed.items : null;
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(object)) {
    throw new Error("URDB response must contain a non-empty array of records");
  }
  return rows;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function eiaId(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) <= 0) return null;
  return String(Number(text));
}

/** URDB uses Unix seconds. Missing dates stay unknown, never the import time. */
function timestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid URDB timestamp");
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid URDB timestamp");
  return date.toISOString();
}

export function toTariffSyncRecords(rows: RawRecord[], utilities: UrdbUtility[]) {
  const byEia = new Map<string, Set<string>>();
  for (const utility of utilities) {
    const key = eiaId(utility.eiaId);
    if (!key) continue;
    const candidates = byEia.get(key) ?? new Set<string>();
    candidates.add(utility.id);
    byEia.set(key, candidates);
  }
  const seen = new Set<string>();
  const coverage = { total: rows.length, matched: 0, ambiguous: 0, unmatched: 0, missingEia: 0 };
  const records: SyncRecord[] = rows.map((raw) => {
    const label = optionalString(raw.label);
    const name = optionalString(raw.name);
    const utilityName = optionalString(raw.utility);
    if (!label || !/^[a-zA-Z0-9_-]+$/.test(label) || !name || !utilityName || raw.approved === false) {
      throw new Error("URDB record has missing/invalid identity or is explicitly unapproved");
    }
    if (seen.has(label)) throw new Error(`Duplicate URDB label: ${label}`);
    seen.add(label);
    const key = eiaId(raw.eiaid ?? raw.eia);
    const candidates = key ? [...(byEia.get(key) ?? [])] : [];
    const matchStatus = !key
      ? "missingEia"
      : candidates.length === 1
        ? "matched"
        : candidates.length > 1
          ? "ambiguous"
          : "unmatched";
    coverage[matchStatus]++;
    return {
      entityId: `tariff-urdb-${label}`,
      sourceId: URDB_SOURCE_ID,
      // The bulk export does not guarantee a last-reviewed/observed timestamp.
      asOf: null,
      fields: {
        upstreamId: label,
        name,
        utilityName,
        utilityId: candidates.length === 1 ? candidates[0] : null,
        eiaId: key,
        matchStatus,
        sector: optionalString(raw.sector),
        serviceType: optionalString(raw.servicetype),
        effectiveFrom: timestamp(raw.startdate),
        effectiveTo: timestamp(raw.enddate),
        supersedes: optionalString(raw.supercedes),
        sourceId: URDB_SOURCE_ID,
        sourceUrl: `https://openei.org/apps/USURDB/rate/view/${encodeURIComponent(label)}`,
        attribution: URDB_ATTRIBUTION,
        rawRecord: raw,
      },
    };
  });
  return { records, coverage };
}
