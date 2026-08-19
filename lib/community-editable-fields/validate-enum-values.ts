/**
 * Server-side validation of submitted enum values (CIR-1506).
 *
 * The contributions endpoint previously validated only that `changes` was a
 * non-empty object. Any string a client sent for an enum field was stored
 * verbatim, and if the contributor was trusted enough to auto-approve, written
 * straight onto the entity. That is how a program ended up with status
 * 'active' in a column where all 607 other rows held 'ACTIVE'.
 *
 * Rejecting unknown values here means a stale option list — in the database, in
 * a cached API response, or in a client that was open across a deploy — can no
 * longer corrupt a column. The definitions module is the authority, and for
 * enum-backed domains it derives its options from the TypeScript enums.
 */

import { editableFieldDefinitions } from "@/lib/community-editable-fields/definitions";

/** Fields resolving options from an external source are not checked here. */
function inlineOptionsFor(entityType: string, fieldName: string): string[] | null {
  const field = editableFieldDefinitions.find((f) => f.entityType === entityType && f.fieldName === fieldName);

  if (!field || field.fieldType !== "enum") return null;

  const options = (field.validationRules as { enum?: unknown } | undefined)?.enum;
  return Array.isArray(options) ? (options as string[]) : null;
}

export interface InvalidEnumValue {
  field: string;
  value: string;
  allowed: string[];
  /** Set when the value matches an allowed option except for case. */
  caseMismatchOf?: string;
}

/**
 * Returns one entry per submitted enum field whose value is not an allowed
 * option. An empty array means every enum value in `changes` is valid.
 *
 * `changes` is accepted in the normalized `{ field: { old, new } }` shape and in
 * the flat `{ field: value }` shape, since the submit endpoint normalizes after
 * its own validation runs.
 */
export function findInvalidEnumValues(entityType: string, changes: Record<string, unknown>): InvalidEnumValue[] {
  const invalid: InvalidEnumValue[] = [];

  for (const [field, raw] of Object.entries(changes)) {
    const allowed = inlineOptionsFor(entityType, field);
    if (!allowed) continue;

    const value =
      raw !== null && typeof raw === "object" && !Array.isArray(raw) && "new" in (raw as Record<string, unknown>)
        ? (raw as { new: unknown }).new
        : raw;

    // Clearing an optional enum is a legitimate edit; only strings are checked.
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string") {
      invalid.push({ field, value: String(value), allowed });
      continue;
    }

    if (allowed.includes(value)) continue;

    const caseMismatchOf = allowed.find((option) => option.toLowerCase() === value.toLowerCase());
    invalid.push({ field, value, allowed, ...(caseMismatchOf ? { caseMismatchOf } : {}) });
  }

  return invalid;
}

/** Human-readable reason for the first invalid value, for API error messages. */
export function describeInvalidEnumValue(invalid: InvalidEnumValue): string {
  if (invalid.caseMismatchOf) {
    return `${invalid.field} must be "${invalid.caseMismatchOf}", not "${invalid.value}" (values are case-sensitive).`;
  }
  return `${invalid.field} must be one of: ${invalid.allowed.join(", ")}. Received "${invalid.value}".`;
}
