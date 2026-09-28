import { describe, expect, it } from "vitest";
import {
  IOU_DR_OWNED_FIELDS,
  programSlug,
  type ScrapedProgram,
  slugify,
  toProgramSyncRecords,
} from "../iou-dr-programs";
import type { ResolverUtility } from "../resolve-entity";

const UTILITIES: Array<ResolverUtility & { slug: string }> = [
  {
    id: "uid-duke",
    slug: "duke-energy",
    name: "Duke Energy Carolinas, LLC",
    eiaId: "5416",
    baCode: "DUK",
    state: "NC",
  },
  {
    id: "uid-xcel",
    slug: "xcel-energy",
    name: "Public Service Co of Colorado",
    eiaId: "15466",
    baCode: "PSCO",
    state: "CO",
  },
  {
    id: "uid-ngrid",
    slug: "national-grid",
    name: "Massachusetts Electric Company",
    eiaId: "11804",
    baCode: "ISNE",
    state: "MA",
  },
];

function scraped(overrides: Partial<ScrapedProgram> = {}): ScrapedProgram {
  return {
    name: "Renewable Battery Connect",
    utility: { eiaId: "15466" },
    assetTypes: ["BATTERY"],
    marketSegments: ["RESIDENTIAL"],
    incentiveStructures: ["BILL_CREDIT"],
    status: "ACTIVE",
    programWebsite: "https://co.my.xcelenergy.com/s/renewable-battery-connect",
    ...overrides,
  };
}

describe("toProgramSyncRecords", () => {
  it("maps a scraped program to a Program SyncRecord (entityType program, not utility)", () => {
    const { records, unresolved } = toProgramSyncRecords([scraped()], UTILITIES);
    expect(unresolved).toEqual([]);
    expect(records).toHaveLength(1);
    const r = records[0];
    // The record targets a PROGRAM row: slug + prog- id, program fields.
    expect(r.slug).toBe("xcel-energy-renewable-battery-connect");
    expect(r.entityId).toBe("prog-xcel-energy-renewable-battery-connect");
    expect(r.fields.name).toBe("Renewable Battery Connect");
    expect(r.fields.assetTypes).toEqual(["BATTERY"]);
  });

  it("links the program to its parent utility by SLUG (not id) via organizations", () => {
    const { records } = toProgramSyncRecords([scraped()], UTILITIES);
    expect(records[0].fields.organizations).toEqual([{ entityId: "xcel-energy", role: "ADMINISTRATOR" }]);
  });

  it("always includes DEMAND_RESPONSE in gridServices without duplicating it", () => {
    const withDup = toProgramSyncRecords([scraped({ gridServices: ["DEMAND_RESPONSE", "PEAK_SHAVING"] })], UTILITIES);
    expect(withDup.records[0].fields.gridServices).toEqual(["DEMAND_RESPONSE", "PEAK_SHAVING"]);
    const without = toProgramSyncRecords([scraped({ gridServices: ["LOAD_SHIFTING"] })], UTILITIES);
    expect(without.records[0].fields.gridServices).toEqual(["LOAD_SHIFTING", "DEMAND_RESPONSE"]);
    const none = toProgramSyncRecords([scraped({ gridServices: undefined })], UTILITIES);
    expect(none.records[0].fields.gridServices).toEqual(["DEMAND_RESPONSE"]);
  });

  it("resolves the utility by name when no eiaId is present", () => {
    const { records, methodCounts } = toProgramSyncRecords(
      [scraped({ utility: { name: "Duke Energy Carolinas, LLC" }, name: "PowerManager" })],
      UTILITIES
    );
    expect(records[0].fields.organizations).toEqual([{ entityId: "duke-energy", role: "ADMINISTRATOR" }]);
    expect(methodCounts.name_trgm).toBe(1);
  });

  it("collects programs whose utility cannot be resolved instead of orphaning them", () => {
    const { records, unresolved, methodCounts } = toProgramSyncRecords(
      [scraped({ utility: { eiaId: "99999", name: "Nonexistent Municipal Light" }, name: "Ghost Program" })],
      UTILITIES
    );
    expect(records).toEqual([]);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].name).toBe("Ghost Program");
    expect(methodCounts.unresolved).toBe(1);
  });

  it("re-runs produce a stable id for the same utility+program (idempotent upsert)", () => {
    const first = toProgramSyncRecords([scraped()], UTILITIES).records[0];
    const second = toProgramSyncRecords([scraped({ description: "updated copy" })], UTILITIES).records[0];
    expect(first.entityId).toBe(second.entityId);
    expect(first.slug).toBe(second.slug);
  });

  it("only asserts fields the scraper actually found (prunes undefined)", () => {
    const { records } = toProgramSyncRecords([scraped({ description: undefined, faqUrl: undefined })], UTILITIES);
    expect(records[0].fields).not.toHaveProperty("description");
    expect(records[0].fields).not.toHaveProperty("faqUrl");
    // programWebsite was provided, so it stays.
    expect(records[0].fields).toHaveProperty("programWebsite");
  });

  it("defaults status to ACTIVE when the scraper did not determine one", () => {
    const { records } = toProgramSyncRecords([scraped({ status: undefined })], UTILITIES);
    expect(records[0].fields.status).toBe("ACTIVE");
  });

  it("keeps a stable, reviewable owned-fields allowlist", () => {
    expect(IOU_DR_OWNED_FIELDS).toContain("organizations");
    expect(IOU_DR_OWNED_FIELDS).toContain("gridServices");
    // The sync must NOT own utility-level or bookkeeping fields.
    expect(IOU_DR_OWNED_FIELDS).not.toContain("id");
    expect(IOU_DR_OWNED_FIELDS).not.toContain("version");
    expect(IOU_DR_OWNED_FIELDS).not.toContain("customerCount");
  });
});

describe("slug helpers", () => {
  it("slugify normalizes case, ampersands, accents, and punctuation", () => {
    expect(slugify("Renewable Battery Connect")).toBe("renewable-battery-connect");
    expect(slugify("Peak Time Payback & Rewards!")).toBe("peak-time-payback-and-rewards");
    expect(slugify("  Édison  Smart  ")).toBe("edison-smart");
  });

  it("programSlug prefixes the utility slug for global uniqueness", () => {
    expect(programSlug("xcel-energy", "Renewable Battery Connect")).toBe("xcel-energy-renewable-battery-connect");
  });
});
