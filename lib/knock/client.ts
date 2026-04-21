/**
 * Knock SDK Client — Singleton Initialization
 *
 * Provides a lazy-initialized Knock client singleton. All Knock operations
 * should call getKnockClient() rather than constructing directly.
 *
 * isKnockConfigured() must be checked before any operation so callers can
 * skip gracefully when KNOCK_API_KEY is absent (e.g., local dev, CI).
 */

import { Knock } from "@knocklabs/node";

let knockClient: Knock | null = null;

/**
 * Returns true when KNOCK_API_KEY is set in the environment.
 * All Knock operations should guard with this check.
 */
export function isKnockConfigured(): boolean {
  return !!process.env.KNOCK_API_KEY;
}

/**
 * Returns the shared Knock client, creating it on first call.
 * Throws if KNOCK_API_KEY is not set — always call isKnockConfigured() first.
 */
export function getKnockClient(): Knock {
  if (!knockClient) {
    const apiKey = process.env.KNOCK_API_KEY;
    if (!apiKey) {
      throw new Error("KNOCK_API_KEY is not set — call isKnockConfigured() before getKnockClient()");
    }
    knockClient = new Knock({ apiKey });
  }
  return knockClient;
}

/**
 * Reset the singleton — intended for use in tests only.
 */
export function resetKnockClient(): void {
  knockClient = null;
}
