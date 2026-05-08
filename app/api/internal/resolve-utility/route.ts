/**
 * POST /api/internal/resolve-utility
 *
 * Internal server-to-server endpoint that wraps the SQL function
 * `fn_resolve_utility_by_name` in a scoped HTTP surface so internal
 * consumers (CRM, Relay, future match pipelines) can resolve a free-form
 * utility name → canonical `eia_id` without direct DB access.
 *
 * Auth:
 *   Requires an API key with the `utilities:resolve` scope. The scope is
 *   deliberately distinct from `utilities:read` so public keys don't get
 *   the resolver surface for free — this is an internal contract.
 *
 * Request body:
 *   {
 *     name:     string  // required. Free-form utility name or email-domain.
 *     state?:   string  // optional. Two-letter state code. Narrows candidates.
 *     domain?:  string  // optional. Email domain (e.g. "gmpvt.com") — if
 *                       // present and `name` is not an email, the endpoint
 *                       // appends "@{domain}" to trigger the domain-match
 *                       // phase inside fn_resolve_utility_by_name.
 *     confidence_threshold?: number  // optional. 0..1. Defaults to 0.85.
 *   }
 *
 * Response (200):
 *   {
 *     eia_id:           string | null,
 *     confidence:       number,         // 0..1
 *     match_source:     string,         // "override_match" | "exact_name_match"
 *                                       // | "domain_match" | "fuzzy_match"
 *                                       // | "no_match" | "none" | "error:*"
 *     candidates:       Array<{
 *       eia_id:      string,
 *       name:        string,
 *       segment:     string | null,
 *       state:       string | null,
 *       match_score: number,
 *     }>,
 *     resolver_version: string,
 *   }
 *
 * Spec: TextureHQ/mono specs/relay/commongrid-nisc-matcher.md (task M6).
 */

import { sql } from "drizzle-orm";
import { ApiError, jsonResponse, type RouteContext, withApiMiddleware } from "@/lib/api";
import { getDb } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Cap free-form input length so a single pathological call can't blow the
 *  planner or the trigram index with a multi-kilobyte input. */
const MAX_NAME_LENGTH = 200;
const MAX_DOMAIN_LENGTH = 253; // RFC 1035 max FQDN
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const DEFAULT_CONFIDENCE = 0.85;

const RESOLVER_VERSION_FALLBACK = "1.0.0";

const DEFAULT_RESULT: ResolveUtilityContract = {
  eia_id: null,
  confidence: 0,
  match_source: "none",
  candidates: [],
  resolver_version: RESOLVER_VERSION_FALLBACK,
};

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

interface ResolveUtilityCandidate {
  eia_id: string;
  name: string;
  segment: string | null;
  state: string | null;
  match_score: number;
  // The SQL function names the state field `state`, but some consumers may
  // have labelled it `jurisdiction` historically. Allow an index signature
  // so we can pass through extra fields without dropping them.
  [extra: string]: unknown;
}

interface ResolveUtilityContract {
  eia_id: string | null;
  confidence: number;
  match_source: string;
  candidates: ResolveUtilityCandidate[];
  resolver_version: string;
}

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

  // name — required, non-empty string, bounded length.
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

  // state — optional, 2-letter alpha code when present.
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

  // domain — optional, bounded length, basic shape check.
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
      // Reject obvious garbage. We're not trying to RFC-validate here — the
      // SQL function's domain path just does an array-contains, so the worst
      // case is an unfindable match, not an exploit.
      if (/[\s@]/.test(d)) {
        throw new ApiError("VALIDATION_ERROR", "'domain' must not contain whitespace or '@'");
      }
      domain = d;
    }
  }

  // confidence_threshold — optional, 0..1 float.
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

/**
 * Build the effective name handed to fn_resolve_utility_by_name.
 *
 * When the caller supplies a `domain` but the `name` doesn't already look
 * like an email, stitch them together as "name@domain". fn_resolve... uses
 * `p_name ~ '@'` as a shortcut into its domain-match phase.
 */
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
  return String(v);
}

function normalizeCandidate(raw: unknown): ResolveUtilityCandidate {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    eia_id: String(c.eia_id ?? ""),
    name: String(c.name ?? ""),
    segment: toOptionalString(c.segment),
    // Accept `state` (canonical) or `jurisdiction` (legacy) from the JSONB.
    state: toOptionalString(c.state ?? c.jurisdiction),
    match_score: toFiniteNumber(c.match_score ?? c.score),
  };
}

/**
 * Coerce whatever we got back from pg into the public contract shape.
 *
 * Defensive against:
 *   - Missing/empty rows → return DEFAULT_RESULT with match_source="none"
 *   - String-typed numerics (some pg drivers stringify JSONB numbers)
 *   - Null or missing candidates array
 *   - Unknown `match_source` values (pass through, don't enum-gate)
 */
function normalizeContract(raw: unknown): ResolveUtilityContract {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_RESULT };
  }
  const c = raw as Record<string, unknown>;

  const eia_id = c.eia_id == null ? null : String(c.eia_id);
  const confidence = toFiniteNumber(c.confidence);
  const match_source = typeof c.match_source === "string" && c.match_source.length > 0 ? c.match_source : "none";
  const candidatesRaw = Array.isArray(c.candidates) ? c.candidates : [];
  const candidates = candidatesRaw.map(normalizeCandidate);
  const resolver_version =
    typeof c.resolver_version === "string" && c.resolver_version.length > 0
      ? c.resolver_version
      : RESOLVER_VERSION_FALLBACK;

  return { eia_id, confidence, match_source, candidates, resolver_version };
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

    // Call the SQL resolver. Parameters are bound — the plpgsql function is
    // SECURITY INVOKER with a pinned search_path, so there is no privilege
    // escalation surface here even though the caller is effectively reaching
    // into a stored function.
    let rawResult: unknown;
    try {
      rawResult = await db.execute(sql`
        SELECT fn_resolve_utility_by_name(
          ${effectiveName}::TEXT,
          ${input.state}::TEXT,
          ${input.confidenceThreshold}::NUMERIC
        ) AS result
      `);
    } catch (err) {
      // Surface a stable error shape — the SQL function should never throw
      // for well-formed inputs, but if it does (e.g., the underlying tables
      // aren't migrated yet) we want a clear 500 rather than a stack trace.
      console.error("fn_resolve_utility_by_name failed:", err);
      throw new ApiError("INTERNAL_ERROR", "Resolver function failed");
    }

    // Drizzle's Neon driver returns { rows } for raw SQL; the production
    // driver may return the array directly. Normalize.
    const rows =
      (rawResult as { rows?: Array<Record<string, unknown>> }).rows ?? (rawResult as Array<Record<string, unknown>>);

    const firstRow = Array.isArray(rows) ? rows[0] : undefined;
    // Zero-row is a legitimate "no match" — return the default contract,
    // not a 500. The SQL function is specified to always return exactly one
    // row, so this branch is belt-and-suspenders.
    const contract = normalizeContract(firstRow?.result);

    // Internal endpoints do not cache — every call is a fresh resolution.
    return jsonResponse(contract, 200, {
      "Cache-Control": "no-store",
    });
  },
  {
    requireAuth: true,
    resource: "utilities",
    action: "resolve",
    rateLimit: true,
    trackUsage: true,
  }
);

// ---------------------------------------------------------------------------
// Next.js route export
// ---------------------------------------------------------------------------

/**
 * Internal endpoints must never be edge-cached — auth failures in
 * particular should not be servable from a CDN. Force `Cache-Control:
 * no-store` on every response regardless of which layer produced it.
 */
function withNoStore(res: Response): Response {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(req: Request, _ctx: unknown = {}): Promise<Response> {
  return withNoStore(await handler(req, { requestId: "" }));
}

export function GET(): Response {
  return Response.json(
    {
      error: {
        code: "BAD_REQUEST",
        message: "Use POST. See docs/api-integration.md §resolve-utility.",
      },
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
