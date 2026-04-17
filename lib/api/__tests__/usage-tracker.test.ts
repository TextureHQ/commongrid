import { describe, expect, it } from "vitest";

import { normalizeEndpoint } from "../usage-tracker";

describe("normalizeEndpoint", () => {
  it("strips query parameters", () => {
    expect(normalizeEndpoint("https://commongrid.info/api/v1/utilities?limit=50")).toBe("/api/v1/utilities");
  });

  it("normalizes UUID segments to :id", () => {
    expect(normalizeEndpoint("https://commongrid.info/api/v1/utilities/a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      "/api/v1/utilities/:id"
    );
  });

  it("normalizes multiple UUIDs in the path", () => {
    expect(
      normalizeEndpoint(
        "https://commongrid.info/api/v1/discussions/a1b2c3d4-e5f6-7890-abcd-ef1234567890/posts/11111111-2222-3333-4444-555555555555"
      )
    ).toBe("/api/v1/discussions/:id/posts/:id");
  });

  it("handles paths without UUIDs", () => {
    expect(normalizeEndpoint("https://commongrid.info/api/v1/utilities")).toBe("/api/v1/utilities");
  });

  it("returns the input for invalid URLs", () => {
    expect(normalizeEndpoint("not-a-url")).toBe("not-a-url");
  });
});
