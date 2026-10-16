import { describe, expect, it } from "vitest";
import { consentRequestSchema, consentSubjectHash } from "./consent";
import { ACCEPTABLE_USE_VERSION, TERMS_VERSION } from "./policies";

describe("consent receipts", () => {
  it("accepts only the current policy versions and a random browser identifier", () => {
    expect(
      consentRequestSchema.safeParse({
        anonymousReceiptId: "adac04c6-83fa-4c58-8d65-7aa0210dfbab",
        termsVersion: TERMS_VERSION,
        acceptableUseVersion: ACCEPTABLE_USE_VERSION,
      }).success
    ).toBe(true);
    expect(
      consentRequestSchema.safeParse({
        anonymousReceiptId: "not-a-uuid",
        termsVersion: TERMS_VERSION,
        acceptableUseVersion: "old",
      }).success
    ).toBe(false);
  });

  it("uses stable, domain-separated hashes without retaining the raw anonymous id", () => {
    const id = "adac04c6-83fa-4c58-8d65-7aa0210dfbab";
    const anonymous = consentSubjectHash({ anonymousReceiptId: id });
    const user = consentSubjectHash({ userId: id, anonymousReceiptId: id });
    expect(anonymous).toHaveLength(64);
    expect(anonymous).not.toContain(id);
    expect(anonymous).not.toBe(user);
    expect(consentSubjectHash({ anonymousReceiptId: id })).toBe(anonymous);
  });
});
