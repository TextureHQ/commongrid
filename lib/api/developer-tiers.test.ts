import { describe, expect, it } from "vitest";

import { DEVELOPER_TIERS, DEVELOPER_TIERS_BY_ID, resolveCurrentTier, type TierResolvableKey } from "./developer-tiers";

describe("DEVELOPER_TIERS", () => {
  it("exposes the three public tiers with PRD-aligned limits", () => {
    expect(DEVELOPER_TIERS.map((t) => t.id)).toEqual(["anonymous", "registered", "bulk"]);
    expect(DEVELOPER_TIERS_BY_ID.anonymous.requestsPerHour).toBe(60);
    expect(DEVELOPER_TIERS_BY_ID.registered.requestsPerHour).toBe(5000);
    expect(DEVELOPER_TIERS_BY_ID.bulk.requestsPerHour).toBe(50000);
    expect(DEVELOPER_TIERS_BY_ID.registered.limit).toBe("5,000/hr");
  });

  it("gives every tier a non-empty label and description", () => {
    for (const tier of DEVELOPER_TIERS) {
      expect(tier.label.length).toBeGreaterThan(0);
      expect(tier.description.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveCurrentTier", () => {
  it("returns anonymous when signed out / no keys", () => {
    expect(resolveCurrentTier(undefined)).toBe("anonymous");
    expect(resolveCurrentTier(null)).toBe("anonymous");
    expect(resolveCurrentTier([])).toBe("anonymous");
  });

  it("returns registered for an active registered key", () => {
    const keys: TierResolvableKey[] = [{ tier: "registered", isActive: true }];
    expect(resolveCurrentTier(keys)).toBe("registered");
  });

  it("returns bulk for an active bulk key", () => {
    const keys: TierResolvableKey[] = [{ tier: "bulk", isActive: true }];
    expect(resolveCurrentTier(keys)).toBe("bulk");
  });

  it("ignores revoked/inactive keys and falls back to anonymous", () => {
    const keys: TierResolvableKey[] = [
      { tier: "registered", isActive: false },
      { tier: "bulk", isActive: false },
    ];
    expect(resolveCurrentTier(keys)).toBe("anonymous");
  });

  it("prefers the highest-limit active key when several exist", () => {
    const keys: TierResolvableKey[] = [
      { tier: "registered", isActive: true },
      { tier: "bulk", isActive: true },
    ];
    expect(resolveCurrentTier(keys)).toBe("bulk");
  });

  it("does not count a revoked bulk key over an active registered key", () => {
    const keys: TierResolvableKey[] = [
      { tier: "bulk", isActive: false },
      { tier: "registered", isActive: true },
    ];
    expect(resolveCurrentTier(keys)).toBe("registered");
  });

  it("falls back to anonymous for an unknown tier on an active key", () => {
    const keys: TierResolvableKey[] = [{ tier: "enterprise", isActive: true }];
    expect(resolveCurrentTier(keys)).toBe("anonymous");
  });

  it("treats missing/blank tier values as anonymous", () => {
    const keys: TierResolvableKey[] = [
      { isActive: true },
      { tier: null, isActive: true },
      { tier: "", isActive: true },
    ];
    expect(resolveCurrentTier(keys)).toBe("anonymous");
  });
});
