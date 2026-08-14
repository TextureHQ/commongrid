/**
 * API key authentication for CommonGrid.
 *
 * Keys are prefixed with `cg_`, stored as SHA-256 hashes, and carry
 * scopes in the format `resource:action` (e.g., `utilities:read`,
 * `*:read`, `*:*`).
 *
 * See docs/specs/persistence-api.md §5.1.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiKeyTier = "registered" | "bulk";

export type AuthResult = {
  valid: boolean;
  /** Human-readable key name (for logs / AuthContext.identity). */
  identity?: string;
  /** Primary key of the `api_keys` row — usage tracking / rate-limit identity. */
  apiKeyId?: string;
  /** Rate-limit tier from the key (`registered` | `bulk`). */
  tier?: ApiKeyTier;
  scopes?: string[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Key hashing
// ---------------------------------------------------------------------------

/** SHA-256 hash of a plaintext API key. Used for storage and lookup. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ---------------------------------------------------------------------------
// Scope matching
// ---------------------------------------------------------------------------

/**
 * Returns true if any scope in the list grants the requested resource+action.
 *
 * Wildcard rules:
 *   - `*:*`       → matches everything
 *   - `*:read`    → matches any resource with action `read`
 *   - `utilities:*` → matches any action on `utilities`
 */
export function hasScope(scopes: string[], resource: string, action: string): boolean {
  for (const scope of scopes) {
    const colonIdx = scope.indexOf(":");
    if (colonIdx === -1) continue;

    const scopeResource = scope.slice(0, colonIdx);
    const scopeAction = scope.slice(colonIdx + 1);

    const resourceMatch = scopeResource === "*" || scopeResource === resource;
    const actionMatch = scopeAction === "*" || scopeAction === action;

    if (resourceMatch && actionMatch) return true;
  }
  return false;
}

function normalizeTier(tier: string | null | undefined): ApiKeyTier {
  return tier === "bulk" ? "bulk" : "registered";
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Extract a Bearer token from an Authorization header value.
 *
 * Variant A contract: only `Authorization: Bearer <key>` is accepted
 * (scheme is case-insensitive per RFC 7235). Any other scheme (`Basic`,
 * raw token without a scheme, etc.) returns null so callers can 401.
 */
export function parseBearerToken(authHeader: string): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const key = match[1].trim();
  return key.length > 0 ? key : null;
}

/**
 * Validates a Bearer API key from an Authorization header.
 *
 * Performs a database lookup by hash, checks expiry and active status,
 * and optionally verifies the key holds the requested scope. Uses a
 * dynamic import so the module can load even when DATABASE_URL is absent
 * (e.g., static builds or dev without a DB).
 *
 * When `resource` / `action` are empty, scope checks are skipped — used
 * for optional auth on public routes where a valid key only elevates the
 * rate-limit tier.
 *
 * The `lastUsedAt` timestamp is updated fire-and-forget.
 *
 * Credential form (Variant A): only `Authorization: Bearer <cg_…>` is
 * accepted. Non-Bearer `Authorization` values are malformed credentials.
 * `X-API-Key` is not read by this module — see middleware.
 */
export async function validateApiKey(authHeader: string | null, resource: string, action: string): Promise<AuthResult> {
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  const key = parseBearerToken(authHeader);
  if (!key) {
    return { valid: false, error: "Invalid Authorization header format" };
  }

  if (!key.startsWith("cg_")) {
    return { valid: false, error: "Invalid API key format" };
  }

  // Dynamic import so this module loads cleanly in no-DB environments.
  const { db } = await import("@/lib/db/client");
  if (!db) {
    return { valid: false, error: "Database not configured" };
  }

  const { apiKeys } = await import("@/lib/db/schema");

  const keyHash = hashApiKey(key);

  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

  const apiKey = rows[0];

  if (!apiKey) {
    return { valid: false, error: "Invalid API key" };
  }

  if (!apiKey.isActive) {
    return { valid: false, error: "API key is inactive" };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, error: "API key has expired" };
  }

  // Scope is only enforced when the caller asks for a specific resource/action
  // (e.g. write routes with `requireAuth`). Public reads use an empty pair so
  // any active key elevates to the registered/bulk tier.
  if (resource && action && !hasScope(apiKey.scopes, resource, action)) {
    return { valid: false, error: "Insufficient scope" };
  }

  // Fire-and-forget — don't block the request on a bookkeeping write.
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyHash, keyHash))
    .catch((err: unknown) => console.error("Failed to update lastUsedAt:", err));

  return {
    valid: true,
    identity: apiKey.name,
    apiKeyId: apiKey.id,
    tier: normalizeTier(apiKey.tier),
    scopes: apiKey.scopes,
  };
}
