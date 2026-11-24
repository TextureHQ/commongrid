import { describe, expect, it, vi } from "vitest";
import { getPooledDb } from "@/lib/db/client-pooled";
import { decideWebsiteBatch, getWebsiteBatch, parseWebsiteDiff } from "../review-website-corrections";

vi.mock("@/lib/db/client-pooled", () => ({ getPooledDb: vi.fn() }));

describe("reviewed website diff", () => {
  it("includes the sourced Batch 2 utility corrections", () => {
    const batch = getWebsiteBatch();
    expect(batch.rows).toHaveLength(66);
    expect(batch.rows.find(({ slug }) => slug === "pud-1-of-snohomish-county")).toMatchObject({
      oldValue: "https://www.snopud-com",
      newValue: "https://www.snopud.com/",
      sourceUrl: "https://www.snopud.com/",
    });
    expect(batch.rows.find(({ slug }) => slug === "mountain-view-electric-association")).toMatchObject({
      oldValue: "https://www.mvea-coop/",
      newValue: "https://www.mvea.coop/",
      sourceUrl: "https://www.mvea.coop/",
    });
    expect(batch.rows.find(({ slug }) => slug === "columbia-basin-electric-cooperative")).toMatchObject({
      oldValue: "https://www.cbec-cc/",
      newValue: "https://cbec.cc/",
      sourceUrl: "https://cbec.cc/",
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
