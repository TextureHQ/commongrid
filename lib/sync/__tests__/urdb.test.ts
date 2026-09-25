import { describe, expect, it } from "vitest";
import { parseUrdb, toTariffSyncRecords, URDB_ATTRIBUTION } from "../urdb";

const raw = {
  label: "sample-ev",
  name: "Example EV schedule",
  utility: "Example Utility",
  eiaid: 123,
  sector: "Residential",
  startdate: 1704067200,
  energyratestructure: [[{ rate: 0.25, unit: "kWh" }]],
  energyweekdayschedule: Array.from({ length: 12 }, () => Array(24).fill(0)),
  source: "https://example.org/tariff.pdf",
  comments: "Separate meter required",
};
const utilities = [{ id: "utility-123", eiaId: "00123" }];

describe("URDB catalog mapping", () => {
  it("preserves complete structures, eligibility, links, attribution and stable identity", () => {
    const { records, coverage } = toTariffSyncRecords([raw], utilities);
    expect(coverage.matched).toBe(1);
    expect(records[0]).toMatchObject({
      entityId: "tariff-urdb-sample-ev",
      sourceId: "openei-urdb",
      asOf: null,
      fields: {
        utilityId: "utility-123",
        eiaId: "123",
        matchStatus: "matched",
        effectiveFrom: "2024-01-01T00:00:00.000Z",
        effectiveTo: null,
        rawRecord: raw,
        attribution: URDB_ATTRIBUTION,
      },
    });
    expect(records[0].fields).not.toHaveProperty("verifiedAt");
    expect(toTariffSyncRecords([raw], utilities).records).toEqual(records);
  });

  it("never guesses name matches or drops unmatched records", () => {
    const rows = [raw, { ...raw, label: "missing", eiaid: null }, { ...raw, label: "unmatched", eiaid: 888 }];
    const result = toTariffSyncRecords(rows, [...utilities, { id: "another", eiaId: "123" }]);
    expect(result.coverage).toEqual({ total: 3, matched: 0, ambiguous: 1, unmatched: 1, missingEia: 1 });
    expect(result.records.every((r) => r.fields.utilityId === null)).toBe(true);
  });

  it("retains expired and superseding schedules without inferring enrollment", () => {
    const record = toTariffSyncRecords([{ ...raw, enddate: 1735689600, supercedes: "older" }], []).records[0];
    expect(record.fields.effectiveTo).toBe("2025-01-01T00:00:00.000Z");
    expect(record.fields.supersedes).toBe("older");
  });

  it.each(
    [
      [{ ...raw, label: undefined }],
      [{ ...raw, name: "" }],
      [{ ...raw, approved: false }],
      [{ ...raw, startdate: "yesterday" }],
      [raw, raw],
    ].map((rows) => ({ rows }))
  )("rejects invalid input before any database write", ({ rows }) => {
    expect(() => toTariffSyncRecords(rows, [])).toThrow();
  });

  it.each([
    JSON.stringify([raw]),
    JSON.stringify({ items: [raw] }),
    `${JSON.stringify(raw)}\n${JSON.stringify({ ...raw, label: "other" })}`,
  ])("parses supported bulk encodings", (text) => {
    expect(parseUrdb(text)[0]).toEqual(raw);
  });

  it.each(["[]", "{}", "<html>error</html>", "[null]", '{"items":[]}', `${JSON.stringify(raw)}\nbroken`])(
    "fails closed on empty/malformed downloads",
    (text) => {
      expect(() => parseUrdb(text)).toThrow();
    }
  );
});
