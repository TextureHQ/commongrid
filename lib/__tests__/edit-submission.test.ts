import { describe, expect, it } from "vitest";
import {
  buildContributionPayload,
  canContinueToConfirm,
  canSubmitContribution,
  computeChangedFields,
  isEditSummaryValid,
  lookupEntityValue,
  snakeToCamel,
} from "@/lib/contributions/edit-submission";
import { EDIT_SUMMARY_MIN_LENGTH } from "@/lib/mod/apply-contribution";

const VALID_SUMMARY = "Updated the customer count from the 2024 EIA-861 filing.";

describe("snakeToCamel", () => {
  it("converts snake_case field names", () => {
    expect(snakeToCamel("customer_count")).toBe("customerCount");
    expect(snakeToCamel("derms_vendor_name")).toBe("dermsVendorName");
  });

  it("leaves already-camelCase names alone", () => {
    expect(snakeToCamel("customerCount")).toBe("customerCount");
    expect(snakeToCamel("website")).toBe("website");
  });
});

describe("lookupEntityValue", () => {
  it("finds snake_case keys", () => {
    expect(lookupEntityValue({ customer_count: 42 }, "customer_count")).toBe(42);
  });

  it("falls back to the camelCase spelling used by entity payloads", () => {
    expect(lookupEntityValue({ customerCount: 42 }, "customer_count")).toBe(42);
  });

  it("returns undefined when neither spelling is present", () => {
    expect(lookupEntityValue({ website: "https://example.com" }, "customer_count")).toBeUndefined();
  });
});

describe("computeChangedFields", () => {
  it("returns nothing for a pristine form (camelCase entity payload)", () => {
    const currentValues = { customerCount: 1000, website: "https://example.com" };
    const formValues = { customer_count: 1000, website: "https://example.com" };
    expect(computeChangedFields(formValues, currentValues)).toEqual({});
  });

  it("detects a changed value", () => {
    const changes = computeChangedFields({ customer_count: 1200 }, { customerCount: 1000 });
    expect(changes).toEqual({ customer_count: 1200 });
  });

  it("treats reverting a field back to its original value as no change", () => {
    const currentValues = { customerCount: 1000 };
    expect(computeChangedFields({ customer_count: 1200 }, currentValues)).toEqual({ customer_count: 1200 });
    expect(computeChangedFields({ customer_count: 1000 }, currentValues)).toEqual({});
  });

  it("treats empty string and undefined as equivalent to null", () => {
    expect(computeChangedFields({ website: "" }, {})).toEqual({});
    expect(computeChangedFields({ website: "" }, { website: null })).toEqual({});
    expect(computeChangedFields({ website: undefined }, { website: "" })).toEqual({});
  });

  it("records clearing a populated field", () => {
    expect(computeChangedFields({ website: "" }, { website: "https://example.com" })).toEqual({ website: "" });
  });

  it("compares multi_enum arrays by content, not identity", () => {
    const currentValues = { assetTypes: ["battery", "solar"] };
    expect(computeChangedFields({ asset_types: ["battery", "solar"] }, currentValues)).toEqual({});
    expect(computeChangedFields({ asset_types: ["battery"] }, currentValues)).toEqual({ asset_types: ["battery"] });
    expect(computeChangedFields({ asset_types: ["battery", "solar", "ev"] }, currentValues)).toEqual({
      asset_types: ["battery", "solar", "ev"],
    });
  });

  it("detects reordered array members as a change", () => {
    const changes = computeChangedFields({ asset_types: ["solar", "battery"] }, { assetTypes: ["battery", "solar"] });
    expect(changes).toEqual({ asset_types: ["solar", "battery"] });
  });

  it("does not treat false or 0 as an absent value", () => {
    expect(computeChangedFields({ is_active: false }, { isActive: false })).toEqual({});
    expect(computeChangedFields({ customer_count: 0 }, { customerCount: 0 })).toEqual({});
    expect(computeChangedFields({ is_active: false }, { isActive: true })).toEqual({ is_active: false });
  });
});

describe("isEditSummaryValid", () => {
  it("requires the minimum length after trimming", () => {
    expect(isEditSummaryValid(VALID_SUMMARY)).toBe(true);
    expect(isEditSummaryValid("too short")).toBe(false);
    expect(isEditSummaryValid(`${" ".repeat(80)}`)).toBe(false);
  });

  it("uses EDIT_SUMMARY_MIN_LENGTH as the default bar", () => {
    expect(isEditSummaryValid("x".repeat(EDIT_SUMMARY_MIN_LENGTH))).toBe(true);
    expect(isEditSummaryValid("x".repeat(EDIT_SUMMARY_MIN_LENGTH - 1))).toBe(false);
  });
});

describe("canContinueToConfirm", () => {
  it("only needs at least one changed field — the summary comes later", () => {
    expect(canContinueToConfirm({})).toBe(false);
    expect(canContinueToConfirm({ customer_count: 1200 })).toBe(true);
  });
});

describe("canSubmitContribution", () => {
  it("requires both changes and an adequate summary", () => {
    expect(canSubmitContribution({ customer_count: 1200 }, VALID_SUMMARY)).toBe(true);
    expect(canSubmitContribution({}, VALID_SUMMARY)).toBe(false);
    expect(canSubmitContribution({ customer_count: 1200 }, "nope")).toBe(false);
  });
});

describe("buildContributionPayload", () => {
  const draft = {
    entityType: "utility",
    entityId: "abc-123",
    entityVersion: 4,
    changes: { customer_count: 1200 },
    editSummary: `  ${VALID_SUMMARY}  `,
    citation: {
      sourceType: "eia_filing",
      sourceUrl: "https://eia.gov/filing",
      sourceDate: "2026-01-15",
    },
  };

  it("maps drawer + confirm state onto the API's snake_case contract", () => {
    expect(buildContributionPayload(draft)).toEqual({
      entity_type: "utility",
      entity_id: "abc-123",
      entity_version: 4,
      changes: { customer_count: 1200 },
      edit_summary: VALID_SUMMARY,
      source_type: "eia_filing",
      source_url: "https://eia.gov/filing",
      source_date: "2026-01-15",
    });
  });

  it("nulls out blank optional citation fields instead of sending empty strings", () => {
    const payload = buildContributionPayload({
      ...draft,
      citation: { sourceType: "utility_website", sourceUrl: "   ", sourceDate: "" },
    });
    expect(payload.source_url).toBeNull();
    expect(payload.source_date).toBeNull();
    expect(payload.source_type).toBe("utility_website");
  });
});
