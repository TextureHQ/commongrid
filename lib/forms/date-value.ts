/**
 * ISO date string <-> React Aria `CalendarDate`.
 *
 * Edges `DateField` is built on react-aria-components, so it speaks
 * `@internationalized/date` values rather than the `"2026-09-17"` strings our
 * forms hold and our API expects. These two helpers do the conversion at the
 * component boundary so the stored value — and therefore every request payload
 * — stays exactly what it was before the migration.
 */

import { type CalendarDate, parseDate } from "@internationalized/date";

/**
 * Parse an ISO `YYYY-MM-DD` string for `DateField`.
 *
 * Returns null for empty input and for anything unparseable. A stored value can
 * be a partially-typed or legacy string, and `parseDate` throws on those —
 * which would take the whole form down with it. An unreadable date is better
 * shown as an empty field the user can correct.
 */
export function toCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/**
 * Serialize a `DateField` value back to the ISO `YYYY-MM-DD` string we store.
 *
 * `CalendarDate.toString()` is already ISO-8601 and, unlike `Date`, carries no
 * time or zone — so a date entered as the 17th cannot be persisted as the 16th
 * in a western timezone.
 */
export function fromCalendarDate(value: { toString(): string } | null | undefined): string {
  return value ? value.toString() : "";
}
