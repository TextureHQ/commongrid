/**
 * resolveEntity — shared utility-resolution for scheduled data syncs (CG-288).
 *
 * Almost every upstream federal/state feed keys its rows by an EIA utility
 * number, and occasionally only by a balancing-authority + state or a bare
 * utility name. The power-plants sync grew its own private eiaId→id lookup
 * (`buildUtilityLookup` in sync-power-plants-monthly.ts); rather than copy that
 * per adapter, this module centralises the resolution so every future adapter
 * (EIA-861, DSIRE, …) shares one tested implementation with a consistent
 * fallback ladder and a machine-readable "how did we match this" method.
 *
 * Resolution ladder (highest confidence first):
 *   1. `eia_id`    — exact EIA utility number match. Authoritative.
 *   2. `ba_state`  — balancing-authority code + state. Used only when the
 *                    (baCode, state) pair maps to exactly one utility, so an
 *                    ambiguous BA never silently picks the wrong utility.
 *   3. `name_trgm` — normalized trigram similarity above a threshold. A
 *                    lightweight local Dice-coefficient implementation (no new
 *                    dependency) — enough to catch "Alabama Power Co" vs
 *                    "Alabama Power Company" without pulling in a fuzzy lib.
 *   4. `unresolved`— nothing matched confidently. The caller collects these and
 *                    reports them; a record is NEVER written with a null parent.
 *
 * Pure and I/O-free: build `UtilityLookups` once (from data/utilities.json or a
 * DB read) and pass it in, so the ladder is unit-testable with fixtures.
 */

/** The minimal shape of a utility this resolver needs to build its lookups. */
export interface ResolverUtility {
  id: string;
  name: string;
  eiaId?: string | number | null;
  baCode?: string | null;
  /** Some feeds only carry a jurisdiction/state list; unused today but cheap. */
  state?: string | null;
}

/** One record's identifying signals, as they arrive from an upstream feed. */
export interface ResolveInput {
  eiaId?: string | number | null;
  baCode?: string | null;
  state?: string | null;
  name?: string | null;
}

export type ResolveMethod = "eia_id" | "ba_state" | "name_trgm" | "unresolved";

export interface ResolveResult {
  utilityId: string | null;
  method: ResolveMethod;
}

/** Pre-indexed lookups. Build once, reuse across every record in a run. */
export interface UtilityLookups {
  /** eia utility number (as string) → utility id. */
  byEiaId: Map<string, string>;
  /** `${baCode}|${state}` (upper-cased) → set of candidate utility ids. */
  byBaState: Map<string, Set<string>>;
  /** normalized name → utility id (exact-normalized fast path). */
  byNormalizedName: Map<string, string>;
  /** All (normalizedName, id) pairs for the trigram fallback scan. */
  nameIndex: Array<{ normalized: string; id: string }>;
}

/**
 * Minimum Dice coefficient (0..1) for a fuzzy name match to be accepted.
 * 0.72 is deliberately conservative: it accepts "co" ↔ "company" style
 * variants and punctuation drift, but rejects merely-similar distinct utilities.
 */
export const NAME_MATCH_THRESHOLD = 0.72;

// ---------------------------------------------------------------------------
// Lookup construction
// ---------------------------------------------------------------------------

/**
 * Build the resolver's indexes from a flat list of utilities (the shape of
 * data/utilities.json, or `SELECT id, name, eia_id, ba_code FROM utilities`).
 */
export function buildUtilityLookups(utilities: ReadonlyArray<ResolverUtility>): UtilityLookups {
  const byEiaId = new Map<string, string>();
  const byBaState = new Map<string, Set<string>>();
  const byNormalizedName = new Map<string, string>();
  const nameIndex: Array<{ normalized: string; id: string }> = [];

  for (const u of utilities) {
    if (u.eiaId !== null && u.eiaId !== undefined) {
      const key = String(u.eiaId).trim();
      // First writer wins so a deterministic input yields a deterministic map.
      if (key && !byEiaId.has(key)) byEiaId.set(key, u.id);
    }

    if (u.baCode && u.state) {
      const key = baStateKey(u.baCode, u.state);
      if (key) {
        const set = byBaState.get(key) ?? new Set<string>();
        set.add(u.id);
        byBaState.set(key, set);
      }
    }

    const normalized = normalizeName(u.name);
    if (normalized) {
      if (!byNormalizedName.has(normalized)) byNormalizedName.set(normalized, u.id);
      nameIndex.push({ normalized, id: u.id });
    }
  }

  return { byEiaId, byBaState, byNormalizedName, nameIndex };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve one upstream record's identifying signals to a utility id, walking
 * the fallback ladder. Returns the matched id (or null) plus the method that
 * matched, so a caller can log/report resolution quality per run.
 */
export function resolveUtilityId(input: ResolveInput, lookups: UtilityLookups): ResolveResult {
  // 1. Exact EIA utility number — highest confidence.
  if (input.eiaId !== null && input.eiaId !== undefined) {
    const key = String(input.eiaId).trim();
    const id = key ? lookups.byEiaId.get(key) : undefined;
    if (id) return { utilityId: id, method: "eia_id" };
  }

  // 2. Balancing authority + state — only when unambiguous.
  if (input.baCode && input.state) {
    const key = baStateKey(input.baCode, input.state);
    const candidates = key ? lookups.byBaState.get(key) : undefined;
    if (candidates && candidates.size === 1) {
      const [only] = candidates;
      return { utilityId: only, method: "ba_state" };
    }
  }

  // 3. Fuzzy name — exact-normalized fast path, then trigram scan.
  if (input.name) {
    const normalized = normalizeName(input.name);
    if (normalized) {
      const exact = lookups.byNormalizedName.get(normalized);
      if (exact) return { utilityId: exact, method: "name_trgm" };

      let bestId: string | null = null;
      let bestScore = 0;
      for (const entry of lookups.nameIndex) {
        const score = diceCoefficient(normalized, entry.normalized);
        if (score > bestScore) {
          bestScore = score;
          bestId = entry.id;
        }
      }
      if (bestId && bestScore >= NAME_MATCH_THRESHOLD) {
        return { utilityId: bestId, method: "name_trgm" };
      }
    }
  }

  // 4. Nothing matched confidently.
  return { utilityId: null, method: "unresolved" };
}

// ---------------------------------------------------------------------------
// Normalization + similarity (local, dependency-free)
// ---------------------------------------------------------------------------

/**
 * Common utility-name suffixes/abbreviations collapsed so that trivial
 * corporate-form drift does not defeat an otherwise-obvious match.
 */
const NAME_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bcompany\b/g, "co"],
  [/\bcorporation\b/g, "corp"],
  [/\bincorporated\b/g, "inc"],
  [/\bcooperative\b/g, "coop"],
  [/\bco-op\b/g, "coop"],
  [/\bassociation\b/g, "assn"],
  [/\bassoc\b/g, "assn"],
  [/\belectric\b/g, "elec"],
  [/\bdepartment\b/g, "dept"],
  [/\bmunicipal\b/g, "muni"],
  [/\bauthority\b/g, "auth"],
  [/\butilities\b/g, "util"],
  [/\butility\b/g, "util"],
];

/**
 * Normalize a utility name for comparison: lower-case, strip punctuation,
 * collapse whitespace, and fold common corporate-form abbreviations. Returns an
 * empty string for nullish/blank input (callers skip empties).
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  let s = name.toLowerCase().replace(/&/g, " and ");
  s = s
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of NAME_ABBREVIATIONS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Sørensen–Dice coefficient over character bigrams — a lightweight, well-behaved
 * string similarity (0..1) that approximates trigram similarity for short names
 * without any external dependency. Identical strings score 1; strings shorter
 * than a bigram fall back to exact equality.
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

function baStateKey(baCode: string | null | undefined, state: string | null | undefined): string | null {
  const ba = (baCode ?? "").trim().toUpperCase();
  const st = (state ?? "").trim().toUpperCase();
  if (!ba || !st) return null;
  return `${ba}|${st}`;
}
