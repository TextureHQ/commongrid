import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/search", () => ({
  searchAll: vi.fn(),
}));

import { searchAll } from "@/lib/data/search";
import { GET } from "./route";

function makeRequest(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    qs.set(key, String(value));
  }
  return new Request(`http://localhost/api/v1/search?${qs.toString()}`);
}

describe("GET /api/v1/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes all supported result groups in the response map", async () => {
    vi.mocked(searchAll).mockResolvedValueOnce({
      source: "db",
      results: new Map([
        ["utility", [{ slug: "u-1", name: "Utility 1", entityType: "utility", matchField: "name" }]],
        ["rate", [{ slug: "r-1", name: "Rate 1", entityType: "rate", matchField: "name" }]],
        ["substation", [{ slug: "s-1", name: "Substation 1", entityType: "substation", matchField: "name" }]],
        ["region", [{ slug: "region-1", name: "Region 1", entityType: "region", matchField: "name" }]],
        ["territory", [{ slug: "territory-1", name: "Territory 1", entityType: "territory", matchField: "name" }]],
      ] as const),
    });

    const res = await GET(makeRequest({ q: "tri-state" }) as never);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      data?: Record<string, unknown[]>;
      meta?: { query: string; totalResults: number; source: string };
    };

    expect(json.meta?.query).toBe("tri-state");
    expect(json.meta?.totalResults).toBe(5);
    expect(json.data?.utilities).toHaveLength(1);
    expect(json.data?.rates).toHaveLength(1);
    expect(json.data?.substations).toHaveLength(1);
    expect(json.data?.regions).toHaveLength(1);
    expect(json.data?.territories).toHaveLength(1);
  });

  it("rejects invalid search parameters", async () => {
    const res = await GET(makeRequest({ q: "x" }) as never);
    expect(res.status).toBe(400);
  });
});
