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
    loadRateBySlug: vi.fn(),
  };
});

import { loadRateBySlug } from "@/lib/data/rate-structures";
import type { RateStructure } from "@/types/rate-structures";
import { GET } from "./route";

const now = "2024-02-15T00:00:00.000Z";

function makeRate(overrides: Partial<RateStructure> & Record<string, unknown> = {}): RateStructure {
  return {
    id: "id-test-rate",
    slug: "test-rate",
    name: "Test Rate",
    utilityName: "Test Utility",
    sector: "Residential",
    serviceType: "Electric",
    hasTou: false,
    hasDemandCharge: false,
    hasNetMetering: false,
    isEvRate: false,
    approved: true,
    isDefault: false,
    sourceUrl: "https://example.com/tariff.pdf",
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

function makeRequest(slug: string) {
  return new Request(`http://localhost/api/v1/rates/${slug}`);
}

describe("GET /api/v1/rates/:slug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CURSOR_SECRET = "test-cursor-secret";
  });

  it("returns a rate structure by slug", async () => {
    vi.mocked(loadRateBySlug).mockResolvedValue(makeRate({ name: "Alpha Rate", slug: "alpha-rate" }));

    const res = await GET(makeRequest("alpha-rate") as never, { params: Promise.resolve({ slug: "alpha-rate" }) });
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data?: { slug: string; name: string; sourceUrl: string } };
    expect(json.data?.slug).toBe("alpha-rate");
    expect(json.data?.name).toBe("Alpha Rate");
    expect(json.data?.sourceUrl).toBe("https://example.com/tariff.pdf");
  });

  it("returns sourceUrlStatus for dead links", async () => {
    vi.mocked(loadRateBySlug).mockResolvedValue(
      makeRate({ name: "Alpha Rate", slug: "alpha-rate", sourceUrlStatus: "dead" })
    );

    const res = await GET(makeRequest("alpha-rate") as never, { params: Promise.resolve({ slug: "alpha-rate" }) });
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data?: { sourceUrlStatus: string } };
    expect(json.data?.sourceUrlStatus).toBe("dead");
  });

  it("returns 404 when the slug does not exist", async () => {
    vi.mocked(loadRateBySlug).mockResolvedValue(null);

    const res = await GET(makeRequest("missing") as never, { params: Promise.resolve({ slug: "missing" }) });
    expect(res.status).toBe(404);

    const json = (await res.json()) as { error?: { message: string } };
    expect(json.error?.message).toContain("missing");
  });
});
