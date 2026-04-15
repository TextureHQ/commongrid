import { createHash } from "crypto";

/**
 * Authentication context returned by the auth middleware.
 */
export interface AuthContext {
  type: "api-key" | "oauth";
  identity: string;
  scopes: string[];
  metadata: Record<string, unknown>;
}

/**
 * Hash an API key for storage/lookup.
 * Keys are stored as SHA-256 hashes — plaintext is never persisted.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Extract the prefix from an API key for identification in logs.
 * e.g., "cg_a1b2c3d4-e5f6-..." → "cg_a1b2"
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 7);
}

/**
 * Check if an AuthContext has a specific scope.
 * Supports exact match and wildcards (* for any resource or action).
 *
 * Examples:
 *   hasScope(auth, "utilities", "read")  → checks for "utilities:read", "utilities:*", "*:read", "*:*"
 */
export function hasScope(
  auth: AuthContext,
  resource: string,
  action: string
): boolean {
  const required = `${resource}:${action}`;
  return auth.scopes.some(
    (s) =>
      s === required ||
      s === `${resource}:*` ||
      s === `*:${action}` ||
      s === "*:*"
  );
}

/**
 * Authenticate a request from the Authorization header.
 * Returns null for unauthenticated requests (OK for public reads).
 * Throws on invalid/expired keys.
 *
 * NOTE: This is a standalone implementation that doesn't depend on
 * the Drizzle schema. It uses raw SQL via the db client.
 * When the full schema is available, this can be updated to use
 * typed queries.
 */
export async function authenticate(
  request: Request
): Promise<AuthContext | null> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) return null;

  if (authHeader.startsWith("Bearer cg_")) {
    return authenticateApiKey(authHeader);
  }

  // Future: JWT (OAuth) support
  // if (authHeader.startsWith("Bearer ey")) {
  //   return authenticateOAuth(authHeader);
  // }

  return null;
}

/**
 * Validate an API key against the database.
 */
async function authenticateApiKey(
  authHeader: string
): Promise<AuthContext | null> {
  // Lazy import to avoid importing db at module level
  // (allows build to pass without DATABASE_URL)
  const { db } = await import("@/lib/db/client");

  if (!db) {
    console.warn("Auth: DATABASE_URL not configured, rejecting API key auth");
    return null;
  }

  const key = authHeader.replace("Bearer ", "");
  const keyHash = hashApiKey(key);

  try {
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(
      sql`SELECT id, name, scopes, expires_at, is_active
          FROM api_keys
          WHERE key_hash = ${keyHash} AND is_active = true
          LIMIT 1`
    );

    const rows = result as unknown as Array<{
      id: string;
      name: string;
      scopes: string[];
      expires_at: string | null;
      is_active: boolean;
    }>;

    if (!rows || rows.length === 0) return null;

    const apiKey = rows[0];

    // Check expiration
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return null;
    }

    // Fire-and-forget: update last_used_at
    db.execute(
      sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${apiKey.id}`
    ).catch(() => {
      // Silently ignore — non-critical
    });

    return {
      type: "api-key",
      identity: apiKey.name,
      scopes: apiKey.scopes ?? [],
      metadata: { keyId: apiKey.id },
    };
  } catch (error) {
    console.error("Auth: API key validation failed:", error);
    return null;
  }
}

/**
 * Require authentication for a request.
 * Returns the auth context or throws an error response.
 */
export async function requireAuth(
  request: Request,
  resource: string,
  action: string
): Promise<AuthContext> {
  const auth = await authenticate(request);

  if (!auth) {
    throw new Response(
      JSON.stringify({
        error: {
          code: "UNAUTHORIZED",
          message:
            "Authentication required. Provide a valid API key via Authorization: Bearer cg_...",
          timestamp: new Date().toISOString(),
        },
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!hasScope(auth, resource, action)) {
    throw new Response(
      JSON.stringify({
        error: {
          code: "FORBIDDEN",
          message: `API key lacks required scope '${resource}:${action}'`,
          timestamp: new Date().toISOString(),
        },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return auth;
}

/**
 * Generate a new API key.
 * Returns the plaintext key (shown once) and the hash for storage.
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const uuid = crypto.randomUUID();
  const key = `cg_${uuid}`;
  const hash = hashApiKey(key);
  const prefix = getKeyPrefix(key);

  return { key, hash, prefix };
}
