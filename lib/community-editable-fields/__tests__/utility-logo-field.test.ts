import { describe, expect, it } from "vitest";

import { editableFieldDefinitions } from "../definitions";

/**
 * CG-323 slice 1: expose utility.logo through the existing community edit +
 * moderation pipeline. These assertions pin the policy that the rest of the
 * flow depends on:
 *
 *  - the field exists and targets the real `utilities.logo` column
 *    (column existence itself is covered by column-mapping.test.ts);
 *  - it is a `url` field, so it is validated and rendered like other link
 *    fields (website, program_website, ...);
 *  - it is `isCritical: true`, flagging a high-visibility field for reviewer
 *    attention. All contributions now require independent human review.
 */
describe("utility.logo editable field (CG-323)", () => {
  const logo = editableFieldDefinitions.find((d) => d.entityType === "utility" && d.fieldName === "logo");

  it("is registered as an editable field", () => {
    expect(logo).toBeDefined();
  });

  it("is a url field", () => {
    expect(logo?.fieldType).toBe("url");
  });

  it("is critical to flag it for reviewer attention", () => {
    expect(logo?.isCritical).toBe(true);
  });

  it("has a human display name", () => {
    expect(logo?.displayName).toBe("Logo");
  });
});
