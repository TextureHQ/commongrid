/**
 * CI guard against enum drift in community-editable field definitions.
 *
 * Background (CIR-1506): the seed script declared `program.status` options as
 * ["active","enrolling","full","paused","ended"] while ProgramStatus is
 * { DRAFT, ACTIVE, PAUSED, FULL, ARCHIVED } and every row in the table stored
 * uppercase ACTIVE. A contributor picked the lowercase option, it auto-approved,
 * and production ended up with 607 `ACTIVE` rows and one `active` — so neither
 * ?status=ACTIVE nor ?status=active returned the correct set.
 *
 * These tests assert the real exported definitions against the real TypeScript
 * enums. They are written so that reverting the fix makes them fail.
 */

import { describe, expect, it } from "vitest";
import { editableFieldDefinitions } from "@/lib/community-editable-fields/definitions";
import { UtilitySegment, UtilityStatus } from "@/types/entities";
import { ProgramStatus } from "@/types/programs";

/** Fields whose domain IS a TypeScript enum. Options must match exactly. */
const TS_ENUM_BACKED_FIELDS: ReadonlyArray<{
  entityType: string;
  fieldName: string;
  enumValues: readonly string[];
}> = [
  { entityType: "program", fieldName: "status", enumValues: Object.values(ProgramStatus) },
  { entityType: "utility", fieldName: "segment", enumValues: Object.values(UtilitySegment) },
  { entityType: "utility", fieldName: "status", enumValues: Object.values(UtilityStatus) },
];

/**
 * Fields whose domain is genuinely NOT a TypeScript enum, with the values
 * actually present in the database. Listed explicitly so that a blanket
 * uppercase sweep over the seed file fails here.
 */
const NON_TS_ENUM_FIELDS: ReadonlyArray<{
  entityType: string;
  fieldName: string;
  mustInclude: readonly string[];
}> = [
  // power_plants.status is stored lowercase in Postgres.
  { entityType: "power_plant", fieldName: "status", mustInclude: ["operable", "proposed"] },
  { entityType: "ev_station", fieldName: "access_code", mustInclude: ["public", "private"] },
  { entityType: "ev_station", fieldName: "status_code", mustInclude: ["E", "P", "T"] },
];

function findField(entityType: string, fieldName: string) {
  const field = editableFieldDefinitions.find((f) => f.entityType === entityType && f.fieldName === fieldName);
  if (!field) {
    throw new Error(`No editable field definition for ${entityType}.${fieldName}`);
  }
  return field;
}

function optionsFor(entityType: string, fieldName: string): string[] {
  const rules = findField(entityType, fieldName).validationRules;
  const options = (rules as { enum?: unknown } | undefined)?.enum;
  if (!Array.isArray(options)) {
    throw new Error(`${entityType}.${fieldName} has no enum option list in validationRules`);
  }
  return options as string[];
}

describe("community-editable enum options match their source of truth", () => {
  for (const { entityType, fieldName, enumValues } of TS_ENUM_BACKED_FIELDS) {
    it(`${entityType}.${fieldName} offers exactly the TS enum members`, () => {
      const options = optionsFor(entityType, fieldName);

      // No option may be absent from the enum. This is the assertion that
      // catches "enrolling" / "ended", which are not ProgramStatus members.
      const notInEnum = options.filter((o) => !enumValues.includes(o));
      expect(notInEnum, `options not present in the TS enum: ${notInEnum.join(", ")}`).toEqual([]);

      // And no enum member may be missing, which catches the absent DRAFT/ARCHIVED.
      const missing = enumValues.filter((v) => !options.includes(v));
      expect(missing, `TS enum members not offered as options: ${missing.join(", ")}`).toEqual([]);
    });

    it(`${entityType}.${fieldName} options are correctly cased`, () => {
      // The original defect was purely case: "active" vs ProgramStatus.ACTIVE.
      // Comparing case-insensitively would have passed, so assert exact bytes.
      for (const option of optionsFor(entityType, fieldName)) {
        const caseInsensitiveMatch = enumValues.find((v) => v.toLowerCase() === option.toLowerCase());
        expect(caseInsensitiveMatch, `no enum member resembles "${option}"`).toBeDefined();
        expect(option, `"${option}" differs from the enum member only by case`).toBe(caseInsensitiveMatch);
      }
    });
  }

  for (const { entityType, fieldName, mustInclude } of NON_TS_ENUM_FIELDS) {
    it(`${entityType}.${fieldName} keeps its non-TS-enum casing`, () => {
      const options = optionsFor(entityType, fieldName);
      for (const value of mustInclude) {
        expect(options, `${entityType}.${fieldName} must still offer "${value}"`).toContain(value);
      }
    });
  }

  it("every enum field declares a non-empty, duplicate-free option list or an external source", () => {
    const enumFields = editableFieldDefinitions.filter((f) => f.fieldType === "enum");
    expect(enumFields.length).toBeGreaterThan(0);

    for (const field of enumFields) {
      const options = (field.validationRules as { enum?: unknown } | undefined)?.enum;
      const label = `${field.entityType}.${field.fieldName}`;

      if (options === undefined) {
        // Fields like `state` and `node_type` resolve their options from an
        // external source rather than an inline list; they must say so.
        expect(field.enumSource, `${label} has neither an option list nor an enumSource`).toBeTruthy();
        continue;
      }

      expect(Array.isArray(options), `${label} enum must be an array`).toBe(true);
      const list = options as string[];
      expect(list.length, `${label} enum must not be empty`).toBeGreaterThan(0);
      expect(new Set(list).size, `${label} enum has duplicate options`).toBe(list.length);
      for (const option of list) {
        expect(typeof option, `${label} option ${String(option)} must be a string`).toBe("string");
      }
    }
  });
});
