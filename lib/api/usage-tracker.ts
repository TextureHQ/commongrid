/**
 * API Usage Tracking for CommonGrid.
 *
 * Records every API request to the `api_usage_events` table for analytics
 * and rate-limit auditing. Designed to be fire-and-forget — never blocks
 * the response.
 *
 * See LDR-64: API usage events table + tracking middleware
 */

import type { ApiUsageEventInsert } from "@/lib/db/schema/api-usage-events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageEvent {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  isAuthenticated: boolean;
  tier: "anonymous" | "registered" | "bulk";
  apiKeyId?: string | null;
}

// ---------------------------------------------------------------------------
// Track usage — fire and forget
// ---------------------------------------------------------------------------

/**
 * Record an API usage event. Returns immediately; the database write
 * runs asynchronously and failures are logged but never throw.
 */
export function trackUsage(event: UsageEvent): void {
  // Run async write in background — don't block the response
  void trackUsageAsync(event);
}

async function trackUsageAsync(event: UsageEvent): Promise<void> {
  try {
    // Dynamic import to avoid pulling in DB deps at module load time
    const { getDb } = await import("@/lib/db/client");
    const { apiUsageEvents } = await import("@/lib/db/schema");

    const db = getDb();

    const row: ApiUsageEventInsert = {
      endpoint: event.endpoint,
      method: event.method,
      statusCode: event.statusCode,
      responseTimeMs: event.responseTimeMs,
      isAuthenticated: event.isAuthenticated,
      tier: event.tier,
      apiKeyId: event.apiKeyId ?? null,
    };

    await db.insert(apiUsageEvents).values(row);
  } catch (err) {
    // Log but never throw — usage tracking must not break the API
    console.error("[usage-tracker] Failed to record API usage event:", err);
  }
}

// ---------------------------------------------------------------------------
// Middleware helper
// ---------------------------------------------------------------------------

/**
 * Extract a clean endpoint path from a full URL by stripping query params
 * and normalizing dynamic segments (UUIDs → `:id`).
 */
export function normalizeEndpoint(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    // Normalize UUID segments to :id for cleaner analytics grouping
    return pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
  } catch {
    return url;
  }
}
