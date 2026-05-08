/**
 * POST /api/v1/utilities/resolve
 *
 * Resolve a free-form utility name (optionally scoped by state or an
 * email domain) to a canonical EIA utility id.
 *
 * This endpoint is public and authenticates exactly the same way as every
 * other CommonGrid API route — via the standard API-key-optional middleware.
 * There is no special role class or "internal" scope; the same tier rules
 * apply to every caller.
 *
 * Why POST?
 * ---------
 * Resolution is effectively a read, but it takes a free-form body (names
 * can contain commas, ampersands, long Unicode strings, and the domain
 * parameter can look confusingly like a subdomain if urlencoded). POST
 * keeps the input out of the URL and lets us version the resolver
 * algorithm cleanly. Rate-limit uses the `write` tier naturally.
 *
 * Request body
 * ------------
 *   {
 *     "name":   string   // required. Free-form utility name or a string
 *                        //   that contains an "@domain" for domain matching.
 *     "state":  string   // optional. Two-letter US state code (case-insensitive).
 *     "domain": string   // optional. Email/web domain (e.g. "duke-energy.com").
 *                        //   Combined with `name` when `name` doesn't
 *                        //   already contain "@".
 *     "confidence_threshold": number // optional. 0..1, default 0.85.
 *   }
 *
 * Response (200)
 * --------------
 *   {
 *     "eia_id":           string | null,
 *     "confidence":       number,  // 0..1
 *     "match_source":     "exact" | "fuzzy" | "alias" | "domain" | "override" | "none",
 *     "canonical_name":   string | null,       // canonical utility name when resolved
 *     "candidates":       [{ eia_id, name, score, segment?, state? }, ...],
 *     "resolver_version": string
 *   }
 */

import { sql } from "drizzle-orm";
import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 200;
const MAX_DOMAIN_LENGTH = 253; // RFC 1035 max FQDN
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const DEFAULT_CONFIDENCE = 0.85;

const RESOLVER_VERSION_FALLBACK = "1.0.0";

/** Match sources the public contract advertises. Unknown values coming
 *  back from the SQL layer are normalized to "none" so the response shape
 *  is always one of these values. */
const MATCH_SOURCES = new Set(["exact", "fuzzy", "alias", "domain", "override", "none"] as const);
type MatchSource = typeof MATCH_SOURCES extends Set<infer T> ? T : never;

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

interface ResolveCandidate {
  eia_id: string;
  name: string;
  score: number;
  segment: string | null;
  state: string | null;
}

interface ResolveResponse {
  eia_id: string | null;
  confidence: number;
  match_source: MatchSource;
  canonical_name: string | null;
  candidates: ResolveCandidate[];
  resolver_version: string;
}

const DEFAULT_RESPONSE: ResolveResponse = {
  eia_id: null,
  confidence: 0,
  match_source: "none",
  canonical_name: null,
  candidates: [],
  resolver_version: RESOLVER_VERSION_FALLBACK,
};

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

interface ResolveInput {
  name: string;
  state: string | null;
  domain: string | null;
  confidenceThreshold: number;
}

function validateInput(raw: unknown): ResolveInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  const body = raw as Record<string, unknown>;

  if (typeof body.name !== "string") {
    throw new ApiError("VALIDATION_ERROR", "'name' is required and must be a string");
  }
  const name = body.name.trim();
  if (name.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "'name' must not be empty");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ApiError("VALIDATION_ERROR", `'name' must be <= ${MAX_NAME_LENGTH} characters`);
  }

  let state: string | null = null;
  if (body.state != null) {
    if (typeof body.state !== "string") {
      throw new ApiError("VALIDATION_ERROR", "'state' must be a string when provided");
    }
    const s = body.state.trim().toUpperCase();
    if (s.length > 0) {
      if (!/^[A-Z]{2}$/.test(s)) {
        throw new ApiError("VALIDATION_ERROR", "'state' must be a 2-letter state code (e.g. 'VT')");
      }
      state = s;
    }
  }

  let domain: string | null = null;
  if (body.domain != null) {
    if (typeof body.domain !== "string") {
      throw new ApiError("VALIDATION_ERROR", "'domain' must be a string when provided");
    }
    const d = body.domain.trim().toLowerCase();
    if (d.length > 0) {
      if (d.length > MAX_DOMAIN_LENGTH) {
        throw new ApiError("VALIDATION_ERROR", `'domain' must be <= ${MAX_DOMAIN_LENGTH} characters`);
      }
      if (/[\s@]/.test(d)) {
        throw new ApiError("VALIDATION_ERROR", "'domain' must not contain whitespace or '@'");
      }
      domain = d;
    }
  }

  let confidenceThreshold = DEFAULT_CONFIDENCE;
  if (body.confidence_threshold != null) {
    if (typeof body.confidence_threshold !== "number" || !Number.isFinite(body.confidence_threshold)) {
      throw new ApiError("VALIDATION_ERROR", "'confidence_threshold' must be a finite number");
    }
    if (body.confidence_threshold < MIN_CONFIDENCE || body.confidence_threshold > MAX_CONFIDENCE) {
      throw new ApiError("VALIDATION_ERROR", "'confidence_threshold' must be between 0 and 1");
    }
    confidenceThreshold = body.confidence_threshold;
  }

  return { name, state, domain, confidenceThreshold };
}

/** If the caller provided a domain and the name isn't already an email,
 *  stitch them together as "name@domain" so the SQL resolver's domain
 *  phase has a trigger. */
function buildEffectiveName(name: string, domain: string | null): string {
  if (!domain) return name;
  if (name.includes("@")) return name;
  return `${name}@${domain}`;
}

// ---------------------------------------------------------------------------
// Output normalization
// ---------------------------------------------------------------------------

function toFiniteNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function toOptionalString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

function toMatchSource(v: unknown): MatchSource {
  if (typeof v !== "string") return "none";
  // Legacy values from older function bodies.
  const alias: Record<string, MatchSource> = {
    override_match: "override",
    exact_name_match: "exact",
    domain_match: "domain",
    fuzzy_match: "fuzzy",
    fuzzy_name_state: "fuzzy",
    no_match: "none",
  };
  const mapped = alias[v] ?? v;
  return (MATCH_SOURCES as Set<string>).has(mapped) ? (mapped as MatchSource) : "none";
}

function normalizeCandidate(raw: unknown): ResolveCandidate {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    eia_id: String(c.eia_id ?? ""),
    name: String(c.name ?? ""),
    score: toFiniteNumber(c.score ?? c.match_score),
    segment: toOptionalString(c.segment),
    state: toOptionalString(c.state ?? c.jurisdiction),
  };
}

function normalizeResponse(raw: unknown): ResolveResponse {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_RESPONSE };
  const c = raw as Record<string, unknown>;

  const eia_id = c.eia_id == null ? null : String(c.eia_id);
  const confidence = toFiniteNumber(c.confidence);
  const match_source = toMatchSource(c.match_source);
  const candidatesRaw = Array.isArray(c.candidates) ? c.candidates : [];
  const candidates = candidatesRaw.map(normalizeCandidate);

  // Pick the canonical name: prefer the explicit field the SQL emits, else
  // fall back to the first candidate's name when we have a resolved id.
  let canonical_name: string | null = toOptionalString(c.canonical_name);
  if (canonical_name == null && eia_id != null && candidates.length > 0) {
    canonical_name = candidates[0]?.name ?? null;
  }

  const resolver_version =
    typeof c.resolver_version === "string" && c.resolver_version.length > 0
      ? c.resolver_version
      : RESOLVER_VERSION_FALLBACK;

  return { eia_id, confidence, match_source, canonical_name, candidates, resolver_version };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const handler = withApiMiddleware(
  async (req: Request, _ctx: RouteContext): Promise<Response> => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
    }

    const input = validateInput(raw);

    const db = getDb();
    if (!db) {
      throw new ApiError("INTERNAL_ERROR", "Database not configured");
    }

    const effectiveName = buildEffectiveName(input.name, input.domain);

    let rawResult: unknown;
    try {
      rawResult = await db.execute(sql`
        SELECT public.fn_resolve_utility_by_name(
          ${effectiveName}::TEXT,
          ${input.state}::TEXT,
          ${input.confidenceThreshold}::NUMERIC
        ) AS result
      `);
    } catch (err) {
      console.error("fn_resolve_utility_by_name failed:", err);
      throw new ApiError("INTERNAL_ERROR", "Resolver function failed");
    }

    const rows =
      (rawResult as { rows?: Array<Record<string, unknown>> }).rows ?? (rawResult as Array<Record<string, unknown>>);
    const firstRow = Array.isArray(rows) ? rows[0] : undefined;
    const payload = normalizeResponse(firstRow?.result);

    // Every resolution is a fresh DB call. Don't let a CDN cache it —
    // responses are parameterized by request body, which intermediate
    // caches don't key on.
    return jsonResponse(payload, 200, {
      "Cache-Control": "no-store",
    });
  },
  {
    // No auth required: public endpoint, same as other /api/v1/* routes.
    // The middleware naturally applies the "write" rate-limit tier to POST
    // requests, which is the correct tier for this endpoint.
    rateLimit: true,
    trackUsage: true,
  }
);

// ---------------------------------------------------------------------------
// Next.js route exports
// ---------------------------------------------------------------------------

export async function POST(req: Request, _ctx: unknown = {}): Promise<Response> {
  const res = await handler(req, { requestId: "" });
  // Defense-in-depth: belt-and-suspenders Cache-Control on every response.
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function GET(): Response {
  return Response.json(
    {
      error: {
        code: "BAD_REQUEST",
        message: "Use POST with a JSON body: { name, state?, domain?, confidence_threshold? }",
      },
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
