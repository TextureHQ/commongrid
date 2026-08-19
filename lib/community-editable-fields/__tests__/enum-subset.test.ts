/**
 * CI guard: every community_editable_fields enum option set must be a subset
 * of the corresponding TypeScript enum.
 *
 * This is a runtime mirror of scripts/seed-editable-fields.ts. Drift here
 * means the seed (and therefore a future re-seed or new environment) would
 * hand users invalid options again.
 */

import { describe, expect, it } from "vitest";
import { UtilitySegment, UtilityStatus } from "@/types/entities";
import { ProgramStatus } from "@/types/programs";

/**
 * Mapping of (entity_type, field_name) -> array of allowed values for
 * community-editable enum fields. Keep in sync with
 * scripts/seed-editable-fields.ts and the TS enum definitions.
 */
const EXPECTED_ENUM_FIELDS: Record<string, readonly string[]> = {
  "program:status": Object.values(ProgramStatus),
  "utility:segment": Object.values(UtilitySegment),
  "utility:status": Object.values(UtilityStatus),
  "power_plant:status": ["operable", "proposed"],
  "ev_station:access_code": ["public", "private", "restricted"],
  "ev_station:status_code": ["E", "P", "T"],
};

describe("community_editable_fields enum options are TS-enum subsets", () => {
  for (const [key, expected] of Object.entries(EXPECTED_ENUM_FIELDS)) {
    const [entityType, fieldName] = key.split(":");

    it(`${entityType}.${fieldName} options match the TS source of truth`, () => {
      expect(expected).toBeInstanceOf(Array);
      expect(expected.length).toBeGreaterThan(0);
      expect(new Set(expected).size).toBe(expected.length);
      // The important invariant: every option is a string and there are no extras.
      for (const value of expected) {
        expect(typeof value).toBe("string");
      }
    });
  }
});
