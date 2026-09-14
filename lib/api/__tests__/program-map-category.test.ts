import { describe, expect, it, vi } from "vitest";

const loadPrograms = vi.fn();

vi.mock("@/lib/data/programs", () => ({
  loadPrograms: (...args: unknown[]) => loadPrograms(...args),
}));

import { GET } from "@/app/api/v1/programs/route";

describe("GET /api/v1/programs sparse fieldsets", () => {
  it("allows mapCategory to be requested and returned", async () => {
    loadPrograms.mockResolvedValue([
      {
        id: "p1",
        slug: "p1",
        name: "Program 1",
        status: "ACTIVE",
        mapCategory: "BATTERY",
        organizations: [],
      },
    ]);

    const res = await GET(new Request("https://commongrid.info/api/v1/programs?fields=slug,name,mapCategory"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data[0]).toEqual({ slug: "p1", name: "Program 1", mapCategory: "BATTERY" });
  });
});
