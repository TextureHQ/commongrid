import { describe, expect, it, vi } from "vitest";
import { getPooledDb } from "@/lib/db/client-pooled";
import { decideWebsiteBatch, getWebsiteBatch, parseWebsiteDiff } from "../review-website-corrections";

vi.mock("@/lib/db/client-pooled", () => ({ getPooledDb: vi.fn() }));

describe("reviewed website diff", () => {
  it("includes the sourced San Isabel correction", () => {
    const batch = getWebsiteBatch();
    expect(batch.rows).toHaveLength(132);
    expect(batch.rows.find(({ slug }) => slug === "san-isabel-electric-association")).toMatchObject({
      oldValue: "http://www.siea-com/",
      newValue: "https://siea.com/",
      sourceUrl: "https://siea.com/",
    });
  });

  it("rejects duplicate entities and non-HTTPS replacements", () => {
    const [row] = getWebsiteBatch().rows;
    expect(() => parseWebsiteDiff([row, row])).toThrow();
    expect(() => parseWebsiteDiff([{ ...row, newValue: "javascript:void(0)" }])).toThrow();
  });

  it("does not open a database connection for a stale approval", async () => {
    expect(await decideWebsiteBatch("mod", "stale", "approve")).toBe("stale");
    expect(getPooledDb).not.toHaveBeenCalled();
  });
});
