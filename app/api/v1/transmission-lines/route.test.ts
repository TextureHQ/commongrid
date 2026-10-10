import { beforeEach, describe, expect, it, vi } from "vitest";

const captured: { sort?: string; order?: string; limit?: number; cursor?: string; result?: unknown }[] = [];

vi.mock("@/lib/data/transmission-lines", () => ({
  countTransmissionLines: vi.fn(async () => 3),
  loadTransmissionLines: vi.fn(async (options = {}) => {
    const sort = options.sort ?? "owner";
    const order = options.order ?? "asc";
    const limit = options.limit ?? 50;
    const cursor = options.cursor ?? null;
    const lines = [
      {
        objectId: 1,
        id: "a-null",
        type: "line",
        status: "active",
        owner: "Alpha",
        voltage: null,
        voltClass: "hv",
        voltageClass: "unknown",
        sub1: "s1",
        sub2: "s2",
        lengthMiles: null,
        naicsCode: "1",
        source: "HIFLD",
      },
      {
        objectId: 2,
        id: "b-short",
        type: "line",
        status: "active",
        owner: "Beta",
        voltage: null,
        voltClass: "hv",
        voltageClass: "unknown",
        sub1: "s1",
        sub2: "s2",
        lengthMiles: 10,
        naicsCode: "1",
        source: "HIFLD",
      },
      {
        objectId: 3,
        id: "c-long",
        type: "line",
        status: "active",
        owner: "Gamma",
        voltage: null,
        voltClass: "hv",
        voltageClass: "unknown",
        sub1: "s1",
        sub2: "s2",
        lengthMiles: 20,
        naicsCode: "1",
        source: "HIFLD",
      },
    ];
    const sorted = [...lines].sort((a, b) => {
      if (sort === "lengthMiles") {
        const aa = a.lengthMiles;
        const bb = b.lengthMiles;
        if (aa == null && bb == null) return a.id.localeCompare(b.id);
        if (aa == null) return 1;
        if (bb == null) return -1;
        const diff = aa - bb;
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      }
      const cmp = String(a[sort as keyof typeof a]).localeCompare(String(b[sort as keyof typeof b]));
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
    let start = 0;
    if (cursor) {
      const cursorValue = cursor.s[sort as keyof typeof cursor.s];
      start = sorted.findIndex((item) => {
        if (sort === "lengthMiles") {
          const iv = item.lengthMiles;
          if (iv == null && cursorValue == null) return item.id > cursor.id;
          if (iv == null) return true;
          if (cursorValue == null) return false;
          const diff = iv - Number(cursorValue);
          return order === "asc" ? diff > 0 || (diff === 0 && item.id > cursor.id) : diff < 0 || (diff === 0 && item.id > cursor.id);
        }
        const diff = String(item[sort as keyof typeof item]).localeCompare(String(cursorValue ?? ""));
        return order === "asc" ? diff > 0 || (diff === 0 && item.id > cursor.id) : diff < 0 || (diff === 0 && item.id > cursor.id);
      });
      if (start === -1) start = sorted.length;
    }
    const page = sorted.slice(start, start + limit + 1);
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    captured.push({ sort, order, limit, cursor: cursor ? JSON.stringify(cursor) : undefined, result: items.map((i) => i.id) });
    return items;
  }),
}));

import { GET } from "./route";

function makeRequest(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    qs.set(key, String(value));
  }
  return new Request(`http://localhost/api/v1/transmission-lines?${qs.toString()}`);
}

describe("GET /api/v1/transmission-lines", () => {
  beforeEach(() => {
    captured.length = 0;
    process.env.CURSOR_SECRET = "test-cursor-secret";
  });

  it("keeps null lengthMiles rows after real lengths in ascending cursor pagination", async () => {
    const first = await GET(makeRequest({ sort: "lengthMiles", order: "asc", limit: 2 }) as never);
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as {
      data?: { id: string; lengthMiles: number | null }[];
      pagination?: { cursor: string | null; hasMore: boolean; total: number };
    };
    expect(firstJson.data?.map((row) => row.id)).toEqual(["b-short", "c-long"]);
    expect(firstJson.pagination?.hasMore).toBe(true);
    expect(firstJson.pagination?.cursor).toBeTruthy();

    const second = await GET(
      makeRequest({ sort: "lengthMiles", order: "asc", limit: 2, cursor: firstJson.pagination?.cursor ?? "" }) as never
    );
    const secondJson = (await second.json()) as {
      data?: { id: string; lengthMiles: number | null }[];
      pagination?: { hasMore: boolean; total: number };
    };
    expect(secondJson.data?.map((row) => row.id)).toEqual(["a-null"]);
    expect(secondJson.data?.[0]?.lengthMiles).toBeNull();
    expect(secondJson.pagination?.hasMore).toBe(false);
  });
});
