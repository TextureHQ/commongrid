/**
 * Public, framework-free description of the CommonGrid API rate-limit tiers.
 *
 * This module powers the public Developers overview page (and can be reused by
 * docs/marketing) so that anonymous visitors can understand the rate-limit
 * tiers without signing in. It intentionally has no React/Next dependencies so
 * it stays trivially unit-testable.
 *
 * The numeric limits here mirror `TIER_LIMITS` in `lib/api/rate-limit.ts`
 * (anonymous 60/hr, registered 5,000/hr, bulk 50,000/hr). Keep them in sync.
 */

/** Identifier for a public-facing rate-limit tier. */
export type DeveloperTierId = "anonymous" | "registered" | "bulk";

/** Public metadata describing a single rate-limit tier. */
export interface DeveloperTier {
  /** Stable tier identifier, matching the API's rate-limit tiers. */
  id: DeveloperTierId;
  /** Human-friendly tier name. */
  label: string;
  /** Requests allowed per hour for this tier. */
  requestsPerHour: number;
  /** Short display string for the hourly limit, e.g. "5,000/hr". */
  limit: string;
  /** One-line explanation of who the tier is for. */
  description: string;
}

/**
 * The three public rate-limit tiers, ordered from lowest to highest limit.
 * Copy is reused from the original Developer Dashboard so messaging stays
 * consistent.
 */
export const DEVELOPER_TIERS: readonly DeveloperTier[] = [
  {
    id: "anonymous",
    label: "Anonymous",
    requestsPerHour: 60,
    limit: "60/hr",
    description: "No authentication required. Great for testing and small projects.",
  },
  {
    id: "registered",
    label: "Registered",
    requestsPerHour: 5000,
    limit: "5,000/hr",
    description: "Free tier with API key authentication. Ideal for most applications.",
  },
  {
    id: "bulk",
    label: "Bulk",
    requestsPerHour: 50000,
    limit: "50,000/hr",
    description: "For high-volume integrations. Contact us to request bulk access.",
  },
] as const;

/** Lookup map for tier metadata by id. */
export const DEVELOPER_TIERS_BY_ID: Record<DeveloperTierId, DeveloperTier> = DEVELOPER_TIERS.reduce(
  (acc, tier) => {
    acc[tier.id] = tier;
    return acc;
  },
  {} as Record<DeveloperTierId, DeveloperTier>
);

/**
 * Minimal shape of an API key needed to resolve the caller's current tier.
 * Compatible with the richer `ApiKey` type used on the developers page.
 */
export interface TierResolvableKey {
  /** The key's tier as stored in the api_keys table. */
  tier?: string | null;
  /** Whether the key is currently active (not revoked). */
  isActive?: boolean | null;
}

/**
 * Resolve the caller's effective tier from their list of API keys.
 *
 * Rules:
 *   - No keys (signed-out or no key yet) → "anonymous".
 *   - Any active key whose tier is a known keyed tier ("registered"/"bulk")
 *     → that tier, preferring the highest-limit active key.
 *   - Revoked/inactive keys are ignored.
 *   - Unknown/blank tiers on active keys fall back to "anonymous".
 *
 * Pure and framework-free so it can be unit tested in isolation.
 */
export function resolveCurrentTier(keys: readonly TierResolvableKey[] | null | undefined): DeveloperTierId {
  if (!keys || keys.length === 0) {
    return "anonymous";
  }

  // Keyed tiers ordered by ascending limit; higher tiers win when a caller
  // holds multiple active keys.
  const keyedTierRank: Record<string, number> = { registered: 1, bulk: 2 };

  let best: DeveloperTierId = "anonymous";
  let bestRank = 0;

  for (const key of keys) {
    if (!key?.isActive) continue;
    const tier = key.tier ?? "";
    const rank = keyedTierRank[tier] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = tier as DeveloperTierId;
    }
  }

  return best;
}
