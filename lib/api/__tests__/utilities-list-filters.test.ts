/**
 * Tests for GET /api/v1/utilities list filter validation.
 *
 * Unknown segment/status values must 400 (not return empty data[]).
 * Happy-path enum filters are covered by scripts/test-api-endpoints.ts
 * and parseEnumFilterParam unit tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {} as unknown,
  getDb: vi.fn(),
}));

import { GET } from "@/app/api/v1/utilities/route";
import { getDb } from "@/lib/db/client";

function makeRequest(url: string): Request {
  return new Request(url, { method: "GET" });
}

describe("GET /api/v1/utilities filter validation", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects segment=cooperative with 400 VALIDATION_ERROR", async () => {
    const res = await GET(makeRequest("https://commongrid.info/api/v1/utilities?segment=cooperative") as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/INVESTOR_OWNED_UTILITY/);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects status=active with 400 VALIDATION_ERROR", async () => {
    const res = await GET(makeRequest("https://commongrid.info/api/v1/utilities?status=active") as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/ACTIVE/);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects NONEXISTENT_SEGMENT with 400 (never empty 200)", async () => {
    const res = await GET(makeRequest("https://commongrid.info/api/v1/utilities?segment=NONEXISTENT_SEGMENT") as never);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(getDb).not.toHaveBeenCalled();
  });
});
