/**
 * API key authentication for CommonGrid.
 *
 * Keys are prefixed with `cg_`, stored as SHA-256 hashes, and carry
 * scopes in the format `resource:action` (e.g., `utilities:read`,
 * `*:read`, `*:*`).
 *
 * See docs/specs/persistence-api.md §5.1.
 */

import { createHash } from "crypto";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthResult = {
  valid: boolean;
  identity?: string;
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
export function hasScope(
  scopes: string[],
  resource: string,
  action: string
): boolean {
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a Bearer API key from an Authorization header.
 *
 * Performs a database lookup by hash, checks expiry and active status,
 * and verifies the key holds the requested scope. Uses a dynamic import
 * so the module can load even when DATABASE_URL is absent (e.g., static
 * builds or dev without a DB).
 *
 * The `lastUsedAt` timestamp is updated fire-and-forget.
 */
export async function validateApiKey(
  authHeader: string | null,
  resource: string,
  action: string
): Promise<AuthResult> {
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Invalid Authorization header format" };
  }

  const key = authHeader.slice(7).trim();

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

  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

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

  if (!hasScope(apiKey.scopes, resource, action)) {
    return { valid: false, error: "Insufficient scope" };
  }

  // Fire-and-forget — don't block the request on a bookkeeping write.
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyHash, keyHash))
    .catch((err: unknown) =>
      console.error("Failed to update lastUsedAt:", err)
    );

  return { valid: true, identity: apiKey.name };
}
