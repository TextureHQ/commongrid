import { describe, expect, it } from "vitest";
import { type DemandResponseRow, EIA_861_ENTITY_TYPE, EIA_861_OWNED_FIELDS, toSyncRecords } from "../eia-861-dr";
import { buildUtilityLookups, type ResolverUtility } from "../resolve-entity";

const UTILITIES: ResolverUtility[] = [
  { id: "util-alabama-power", name: "Alabama Power Company", eiaId: "195", baCode: "SOCO", state: "AL" },
  { id: "util-aiken", name: "Aiken Electric Cooperative", eiaId: "162", baCode: "SC", state: "SC" },
];
const LOOKUPS = buildUtilityLookups(UTILITIES);
const EXISTING = new Set(["util-alabama-power", "util-aiken"]);

function row(overrides: Partial<DemandResponseRow>): DemandResponseRow {
  return {
    utilityNumber: "195",
    utilityName: "Alabama Power Company",
    state: "AL",
    baCode: "SOCO",
    reportYear: 2024,
    customersEnrolled: 100,
    energySavingsMwh: 10,
    potentialPeakSavingsMw: 5,
    actualPeakSavingsMw: 3,
    programCostUsd: 1000,
    ...overrides,
  };
}

describe("eia-861-dr toSyncRecords", () => {
  it("exports the utility entity type (never program)", () => {
    expect(EIA_861_ENTITY_TYPE).toBe("utility");
  });

  it("maps a resolved row to a SyncRecord asserting only owned fields", () => {
    const { records, unresolved } = toSyncRecords([row({})], EXISTING, LOOKUPS);
    expect(unresolved).toHaveLength(0);
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.entityId).toBe("util-alabama-power");
    // slug is never set (we only ever update existing utilities).
    expect(rec.slug).toBeUndefined();
    const fieldKeys = Object.keys(rec.fields).sort();
    expect(fieldKeys).toEqual([...EIA_861_OWNED_FIELDS].sort());
    expect(rec.fields.hasDemandResponse).toBe(true);
    expect(rec.fields.drReportYear).toBe(2024);
  });

  it("aggregates (sums) across customer-class / state rows for one utility", () => {
    const rows = [
      row({
        customersEnrolled: 100,
        energySavingsMwh: 10,
        potentialPeakSavingsMw: 5,
        actualPeakSavingsMw: 3,
        programCostUsd: 1000,
      }),
      row({
        customersEnrolled: 55,
        energySavingsMwh: 2.5,
        potentialPeakSavingsMw: 1.25,
        actualPeakSavingsMw: 0.5,
        programCostUsd: 250,
      }),
    ];
    const { records } = toSyncRecords(rows, EXISTING, LOOKUPS);
    expect(records).toHaveLength(1);
    expect(records[0].fields.drCustomersEnrolled).toBe(155);
    expect(records[0].fields.drEnergySavingsMwh).toBe(12.5);
    expect(records[0].fields.drPotentialPeakSavingsMw).toBe(6.25);
    expect(records[0].fields.drActualPeakSavingsMw).toBe(3.5);
    expect(records[0].fields.drProgramCostUsd).toBe(1250);
  });

  it("collects unresolved rows and never emits a null-parent record", () => {
    const rows = [row({ utilityNumber: "999999", utilityName: "Ghost Utility LLC", baCode: null, state: "ZZ" })];
    const { records, unresolved } = toSyncRecords(rows, EXISTING, LOOKUPS);
    expect(records).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].utilityNumber).toBe("999999");
  });

  it("treats a resolved-but-not-in-DB utility as unresolved (never creates)", () => {
    const lookups = buildUtilityLookups([...UTILITIES, { id: "util-not-in-db", name: "Phantom Power", eiaId: "555" }]);
    const rows = [row({ utilityNumber: "555", utilityName: "Phantom Power" })];
    // EXISTING deliberately omits util-not-in-db.
    const { records, unresolved } = toSyncRecords(rows, EXISTING, lookups);
    expect(records).toHaveLength(0);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].utilityNumber).toBe("555");
  });

  it("reports resolution method counts (once per utility)", () => {
    const rows = [
      row({ utilityNumber: "195" }),
      row({ utilityNumber: "195" }), // same utility, second row must not double-count
      row({ utilityNumber: "162", utilityName: "Aiken Electric Cooperative", state: "SC", baCode: "SC" }),
    ];
    const { methodCounts } = toSyncRecords(rows, EXISTING, LOOKUPS);
    expect(methodCounts.eia_id).toBe(2);
    expect(methodCounts.ba_state).toBe(0);
    expect(methodCounts.name_trgm).toBe(0);
  });

  it("is pure — calling twice yields identical output and mutates no input", () => {
    const rows = [row({}), row({ utilityNumber: "162", utilityName: "Aiken Electric Cooperative" })];
    const frozen = rows.map((r) => Object.freeze({ ...r }));
    const first = toSyncRecords(frozen, EXISTING, LOOKUPS);
    const second = toSyncRecords(frozen, EXISTING, LOOKUPS);
    expect(JSON.stringify(first.records)).toBe(JSON.stringify(second.records));
  });

  it("emits records in a deterministic (utility-id) order", () => {
    const rows = [
      row({ utilityNumber: "162", utilityName: "Aiken Electric Cooperative", state: "SC", baCode: "SC" }),
      row({ utilityNumber: "195" }),
    ];
    const { records } = toSyncRecords(rows, EXISTING, LOOKUPS);
    expect(records.map((r) => r.entityId)).toEqual(["util-aiken", "util-alabama-power"]);
  });
});
