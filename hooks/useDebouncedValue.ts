/**
 * useDebouncedValue — single shared debounce primitive for search inputs.
 *
 * Why this exists:
 * Every list surface (explore panels + the standalone table pages) had its own
 * copy-pasted `useEffect(() => setTimeout(...))` debounce at 300ms or 350ms,
 * with subtly different cleanup. That made the typing experience inconsistent
 * and made it impossible to tune the window in one place.
 *
 * Semantics (deliberately boring — this is textbook trailing-edge debounce):
 *   - Every change to `value` restarts the timer.
 *   - The debounced value only updates once `delayMs` has elapsed with no
 *     further changes.
 *   - Unmount clears the pending timer.
 *
 * Callers keep the *raw* value bound to the input (so typing is never blocked
 * or reverted) and feed only the debounced value into fetch keys.
 */

import { useEffect, useState } from "react";

/**
 * Shared debounce window for list/search inputs, in milliseconds.
 *
 * 250ms is the tuned value: long enough that "Verm" typed at a normal cadence
 * produces a single request, short enough that a deliberate pause feels
 * instant. Do not fork this per-surface — consistency is the point.
 */
export const SEARCH_DEBOUNCE_MS = 250;

export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // The effect only re-runs when `value` itself changes, so a parent
    // re-render with an unchanged value never re-arms the timer. When the
    // timer fires it updates `debounced` only — deps are untouched, so it
    // cannot re-arm itself.
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
