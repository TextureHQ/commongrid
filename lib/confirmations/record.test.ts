import { describe, expect, it } from "vitest";
import {
  buildRows,
  checkAgainstRows,
  confirmationFor,
  confirmedLine,
  confirmerName,
  displayUrl,
  parseConfirmRequest,
  publicConfirmations,
  type RecordInput,
  rowKey,
  statusLabel,
} from "./record";

const coop: RecordInput = {
  utility: {
    id: "u1",
    name: "4-County Electric Power Association",
    shortName: null,
    segment: "DISTRIBUTION_COOPERATIVE",
    website: "https://4county.org",
    generationProviderId: "tva",
  },
  supplier: { id: "tva", name: "Tennessee Valley Authority" },
  programs: [
    { id: "p2", slug: "zap", name: "Zap Rebate", status: "ACTIVE" },
    { id: "p1", slug: "beat-the-peak", name: "Beat the Peak Alerts", status: "COMING_SOON" },
  ],
  confirmations: [],
};

describe("displayUrl", () => {
  it("drops the scheme and trailing slash but keeps the path", () => {
    expect(displayUrl("http://www.4county.org/")).toBe("www.4county.org");
    expect(displayUrl("https://4county.org/old-outage-page")).toBe("4county.org/old-outage-page");
  });
});

describe("buildRows", () => {
  it("lists website, power supplier, then programs by name", () => {
    const rows = buildRows(coop);
    expect(rows.map((r) => r.label)).toEqual(["Website", "Power supplier", "Beat the Peak Alerts", "Zap Rebate"]);
    expect(rows[0]).toMatchObject({ value: "https://4county.org", displayValue: "4county.org" });
    expect(rows[1]).toMatchObject({
      value: "tva",
      displayValue: "Tennessee Valley Authority",
      handoff: { kind: "discussion" },
    });
    expect(rows[2]).toMatchObject({
      displayValue: "Coming soon",
      handoff: { kind: "program_page", programSlug: "beat-the-peak" },
    });
  });

  it("only asks co-ops about a power supplier", () => {
    const rows = buildRows({ ...coop, utility: { ...coop.utility, segment: "INVESTOR_OWNED" } });
    expect(rows.some((r) => r.fieldName === "generationProviderId")).toBe(false);
  });

  it("marks blank values as missing", () => {
    const rows = buildRows({
      ...coop,
      utility: { ...coop.utility, website: "  ", generationProviderId: null },
      supplier: null,
    });
    expect(rows[0]).toMatchObject({ value: null, displayValue: null });
    expect(rows[1]).toMatchObject({ value: null, displayValue: null });
  });

  it("uses the latest confirmation that still matches the current value", () => {
    const rows = buildRows({
      ...coop,
      confirmations: [
        {
          entityType: "utility",
          entityId: "u1",
          fieldName: "website",
          confirmedValue: "https://4county.org",
          createdAt: new Date("2026-10-01T00:00:00Z"),
        },
        {
          entityType: "utility",
          entityId: "u1",
          fieldName: "website",
          confirmedValue: "https://4county.org",
          createdAt: new Date("2026-11-01T00:00:00Z"),
        },
        // An older value: no longer applies.
        {
          entityType: "utility",
          entityId: "u1",
          fieldName: "generationProviderId",
          confirmedValue: "other",
          createdAt: new Date("2026-11-05T00:00:00Z"),
        },
      ],
    });
    expect(rows[0].lastConfirmedAt).toBe("2026-11-01T00:00:00.000Z");
    expect(rows[1].lastConfirmedAt).toBeNull();
  });
});

describe("statusLabel and confirmerName", () => {
  it("reads naturally", () => {
    expect(statusLabel("ACTIVE")).toBe("Active");
    expect(statusLabel("COMING_SOON")).toBe("Coming soon");
    expect(confirmerName({ name: "Snohomish County PUD No. 1", shortName: "Snohomish PUD" })).toBe("Snohomish PUD");
    expect(confirmerName({ name: "4-County Electric Power Association", shortName: " " })).toBe(
      "4-County Electric Power Association"
    );
  });
});

describe("parseConfirmRequest", () => {
  const field = { entityType: "utility", entityId: "u1", fieldName: "website", value: "https://4county.org" };

  it("accepts a list of fields with the values seen", () => {
    expect(parseConfirmRequest({ fields: [field] })).toEqual({ ok: true, fields: [field] });
  });

  it("rejects empty, unknown, blank and duplicate fields", () => {
    expect(parseConfirmRequest(null).ok).toBe(false);
    expect(parseConfirmRequest({ fields: [] }).ok).toBe(false);
    expect(parseConfirmRequest({ fields: [{ ...field, fieldName: "customerCount" }] }).ok).toBe(false);
    expect(parseConfirmRequest({ fields: [{ ...field, entityType: "power_plant" }] }).ok).toBe(false);
    expect(parseConfirmRequest({ fields: [{ ...field, value: " " }] }).ok).toBe(false);
    expect(parseConfirmRequest({ fields: [field, field] }).ok).toBe(false);
    expect(
      parseConfirmRequest({ fields: Array.from({ length: 51 }, (_, i) => ({ ...field, entityId: `u${i}` })) }).ok
    ).toBe(false);
  });
});

describe("checkAgainstRows", () => {
  const rows = buildRows(coop);

  it("passes fields whose value is unchanged", () => {
    const r = checkAgainstRows([{ entityType: "program", entityId: "p2", fieldName: "status", value: "ACTIVE" }], rows);
    expect(r.ok && r.rows.map((x) => x.label)).toEqual(["Zap Rebate"]);
  });

  it("flags fields this utility doesn't have, and values that changed", () => {
    const r = checkAgainstRows(
      [
        { entityType: "program", entityId: "elsewhere", fieldName: "status", value: "ACTIVE" },
        { entityType: "utility", entityId: "u1", fieldName: "website", value: "https://old.example" },
      ],
      rows
    );
    expect(r).toEqual({
      ok: false,
      unknown: [rowKey("program", "elsewhere", "status")],
      stale: [rowKey("utility", "u1", "website")],
    });
  });
});

describe("public display", () => {
  const at = new Date("2026-11-10T18:00:00Z");
  const rows = buildRows({
    ...coop,
    confirmations: [
      {
        entityType: "utility",
        entityId: "u1",
        fieldName: "website",
        confirmedValue: "https://4county.org",
        createdAt: at,
      },
      // Confirmed when the supplier was someone else: no longer applies.
      {
        entityType: "utility",
        entityId: "u1",
        fieldName: "generationProviderId",
        confirmedValue: "other",
        createdAt: at,
      },
      { entityType: "program", entityId: "p2", fieldName: "status", confirmedValue: "ACTIVE", createdAt: at },
    ],
  });
  const list = publicConfirmations(rows);

  it("lists only fields whose current value was confirmed, with nothing about the person", () => {
    expect(list).toEqual([
      {
        entityType: "utility",
        entityId: "u1",
        fieldName: "website",
        value: "https://4county.org",
        confirmedAt: at.toISOString(),
      },
      {
        entityType: "program",
        entityId: "p2",
        fieldName: "status",
        value: "ACTIVE",
        confirmedAt: at.toISOString(),
        programSlug: "zap",
      },
    ]);
  });

  it("finds a field's confirmation only while the page shows the confirmed value", () => {
    expect(confirmationFor(list, { fieldName: "website" }, "https://4county.org")?.confirmedAt).toBe(at.toISOString());
    expect(confirmationFor(list, { fieldName: "website" }, "https://new.example")).toBeNull();
    expect(confirmationFor(list, { fieldName: "website" }, null)).toBeNull();
    expect(confirmationFor(list, { fieldName: "generationProviderId" }, "tva")).toBeNull();
    expect(confirmationFor(list, { fieldName: "status", programSlug: "zap" }, "ACTIVE")).not.toBeNull();
    expect(confirmationFor(list, { fieldName: "status", programSlug: "zap" }, "PAUSED")).toBeNull();
    expect(confirmationFor(list, { fieldName: "status", programSlug: "beat-the-peak" }, "COMING_SOON")).toBeNull();
  });

  it("says staff, and names the field where the line isn't directly under it", () => {
    expect(confirmedLine("4-County Electric", at.toISOString())).toBe(
      "Confirmed by 4-County Electric staff · Nov 10, 2026"
    );
    expect(confirmedLine("4-County Electric", at.toISOString(), "status")).toBe(
      "Status confirmed by 4-County Electric staff · Nov 10, 2026"
    );
  });
});
