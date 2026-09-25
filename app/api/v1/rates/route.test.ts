import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn(async () => ({
      success: true,
      remaining: 99,
      reset: Math.floor(Date.now() / 1000) + 60,
      limit: 100,
      tier: "anonymous" as const,
    })),
  };
});

vi.mock("@/lib/data/rate-structures", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/rate-structures")>();
  return {
    ...actual,
    loadRateStructures: vi.fn(),
  };
});

import { loadRateStructures } from "@/lib/data/rate-structures";
import type { RateStructure } from "@/types/rate-structures";
import { GET } from "./route";

const now = "2024-02-15T00:00:00.000Z";

function makeRate(overrides: Partial<RateStructure> & Record<string, unknown> = {}): RateStructure {
  const name = String(overrides.name ?? "Test Rate");
  return {
    id: `id-${name}`,
    slug: `slug-${name}`,
    name,
    utilityName: overrides.utilityName ?? "Test Utility",
    sector: overrides.sector ?? "Residential",
    serviceType: overrides.serviceType ?? "Electric",
    hasTou: (overrides.hasTou as boolean) ?? false,
    hasDemandCharge: (overrides.hasDemandCharge as boolean) ?? false,
    hasNetMetering: (overrides.hasNetMetering as boolean) ?? false,
    isEvRate: (overrides.isEvRate as boolean) ?? false,
    approved: (overrides.approved as boolean) ?? true,
    isDefault: false,
    sourceUrl: overrides.sourceUrl as string | undefined,
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

function fakeLoadRateStructures(rates: RateStructure[]) {
  vi.mocked(loadRateStructures).mockImplementation(async (filters) => {
    let result = rates.map((r) => ({ ...r }));
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.utilityName as string).toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q)
      );
    }
    if (filters?.sector) {
      result = result.filter((r) => r.sector === filters.sector);
    }
    if (typeof filters?.hasTou === "boolean") {
      result = result.filter((r) => r.hasTou === filters.hasTou);
    }
    if (typeof filters?.hasDemandCharge === "boolean") {
      result = result.filter((r) => r.hasDemandCharge === filters.hasDemandCharge);
    }
    if (typeof filters?.hasNetMetering === "boolean") {
      result = result.filter((r) => r.hasNetMetering === filters.hasNetMetering);
    }
    if (typeof filters?.isEvRate === "boolean") {
      result = result.filter((r) => r.isEvRate === filters.isEvRate);
    }
    if (filters?.utilityId) {
      result = result.filter((r) => r.utilityId === filters.utilityId);
    }
    if (filters?.eiaId !== undefined) {
      result = result.filter((r) => r.eiaId === filters.eiaId);
    }
    return result;
  });
}

function makeRequest(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    qs.set(key, String(value));
  }
  return new Request(`http://localhost/api/v1/rates?${qs.toString()}`);
}

describe("GET /api/v1/rates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CURSOR_SECRET = "test-cursor-secret";
  });

  it("returns rate structures with default pagination", async () => {
    fakeLoadRateStructures([makeRate({ name: "Alpha Rate", slug: "alpha" })]);

    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      data?: { slug: string; name: string; utilityName: string }[];
      pagination?: { total: number; hasMore: boolean; limit: number; cursor: string | null };
    };
    expect(json.pagination?.total).toBe(1);
    expect(json.pagination?.hasMore).toBe(false);
    expect(json.pagination?.limit).toBe(50);
    expect(json.data).toHaveLength(1);

    const row = json.data?.[0];
    expect(row?.slug).toBe("alpha");
    expect(row?.name).toBe("Alpha Rate");
    expect(row?.utilityName).toBe("Test Utility");
  });

  it("filters by sector", async () => {
    fakeLoadRateStructures([
      makeRate({ name: "Residential Rate", slug: "res", sector: "Residential" }),
      makeRate({ name: "Commercial Rate", slug: "com", sector: "Commercial" }),
    ]);

    const res = await GET(makeRequest({ sector: "Commercial" }) as never);
    const json = (await res.json()) as { data?: { name: string }[]; pagination?: { total: number } };
    expect(json.pagination?.total).toBe(1);
    expect(json.data?.[0]?.name).toBe("Commercial Rate");
  });

  it("filters by boolean flags", async () => {
    fakeLoadRateStructures([
      makeRate({ name: "TOU Rate", slug: "tou", hasTou: true }),
      makeRate({ name: "Flat Rate", slug: "flat", hasTou: false }),
    ]);

    const res = await GET(makeRequest({ hasTou: "true" }) as never);
    const json = (await res.json()) as { data?: { name: string }[]; pagination?: { total: number } };
    expect(json.pagination?.total).toBe(1);
    expect(json.data?.[0]?.name).toBe("TOU Rate");
  });

  it("searches across name, utilityName, and slug", async () => {
    fakeLoadRateStructures([
      makeRate({ name: "Green Tariff", slug: "green-tariff", utilityName: "Green Power Co" }),
      makeRate({ name: "Other Rate", slug: "other", utilityName: "Other Co" }),
    ]);

    const res = await GET(makeRequest({ search: "green" }) as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { name: string }[]; pagination?: { total: number } };
    expect(json.pagination?.total).toBe(1);
    expect(json.data?.[0]?.name).toBe("Green Tariff");
  });

  it("returns empty results when the dataset has no matches", async () => {
    fakeLoadRateStructures([
      makeRate({ name: "Alpha Rate", slug: "alpha" }),
      makeRate({ name: "Beta Rate", slug: "beta" }),
    ]);

    const res = await GET(makeRequest({ sector: "Industrial" }) as never);
    const json = (await res.json()) as { data?: unknown[]; pagination?: { total: number; hasMore: boolean } };
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(0);
    expect(json.pagination?.total).toBe(0);
    expect(json.pagination?.hasMore).toBe(false);
  });

  it("supports cursor pagination round-trip", async () => {
    fakeLoadRateStructures([
      makeRate({ name: "Alpha Rate", slug: "alpha" }),
      makeRate({ name: "Beta Rate", slug: "beta" }),
      makeRate({ name: "Gamma Rate", slug: "gamma" }),
    ]);

    const first = await GET(makeRequest({ limit: 1 }) as never);
    const firstJson = (await first.json()) as {
      data?: { name: string }[];
      pagination?: { total: number; hasMore: boolean; cursor: string | null };
    };
    expect(firstJson.data?.[0]?.name).toBe("Alpha Rate");
    expect(firstJson.pagination?.hasMore).toBe(true);
    expect(firstJson.pagination?.cursor).toBeTruthy();

    const second = await GET(makeRequest({ limit: 1, cursor: firstJson.pagination?.cursor ?? "" }) as never);
    const secondJson = (await second.json()) as {
      data?: { name: string }[];
      pagination?: { total: number; hasMore: boolean; cursor: string | null };
    };
    expect(secondJson.data?.[0]?.name).toBe("Beta Rate");
    expect(secondJson.pagination?.hasMore).toBe(true);

    const third = await GET(makeRequest({ limit: 1, cursor: secondJson.pagination?.cursor ?? "" }) as never);
    const thirdJson = (await third.json()) as {
      data?: { name: string }[];
      pagination?: { total: number; hasMore: boolean; cursor: string | null };
    };
    expect(thirdJson.data?.[0]?.name).toBe("Gamma Rate");
    expect(thirdJson.pagination?.hasMore).toBe(false);
  });

  it("rejects invalid sort parameters with 400", async () => {
    fakeLoadRateStructures([makeRate({ name: "Alpha Rate", slug: "alpha" })]);

    const res = await GET(makeRequest({ sort: "invalid" }) as never);
    expect(res.status).toBe(400);
  });

  it("filters by utilityId", async () => {
    fakeLoadRateStructures([
      makeRate({ name: "Rate A", slug: "rate-a", utilityId: "utility-1" }),
      makeRate({ name: "Rate B", slug: "rate-b", utilityId: "utility-2" }),
    ]);

    const res = await GET(makeRequest({ utilityId: "utility-1" }) as never);
    const json = (await res.json()) as { data?: { name: string }[]; pagination?: { total: number } };
    expect(json.pagination?.total).toBe(1);
    expect(json.data?.[0]?.name).toBe("Rate A");
  });

  it("filters by eiaId", async () => {
    fakeLoadRateStructures([
      makeRate({ name: "Rate A", slug: "rate-a", eiaId: 12345 }),
      makeRate({ name: "Rate B", slug: "rate-b", eiaId: 67890 }),
    ]);

    const res = await GET(makeRequest({ eiaId: 12345 }) as never);
    const json = (await res.json()) as { data?: { name: string }[]; pagination?: { total: number } };
    expect(json.pagination?.total).toBe(1);
    expect(json.data?.[0]?.name).toBe("Rate A");
  });
});
