import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
  }),
}));

// Rate limiting is exercised in its own suite; here we always allow so the
// validation + notification behaviour is what's under test. resetRateLimiters
// and the header helpers stay real.
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn(async () => ({
      success: true,
      remaining: 99,
      reset: Math.floor(Date.now() / 1000) + 60,
      limit: 100,
      tier: "write" as const,
    })),
  };
});

vi.mock("@/lib/knock/client", () => ({
  isKnockConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/knock/workflows", () => ({
  triggerModDatasetSuggestion: vi.fn(async () => "run-id"),
}));

import { checkRateLimit } from "@/lib/api/rate-limit";
import { isKnockConfigured } from "@/lib/knock/client";
import { triggerModDatasetSuggestion } from "@/lib/knock/workflows";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/dataset-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    submitterEmail: "jane@example.com",
    submitterName: "Jane Rivera",
    datasetName: "Interconnection queue positions",
    dataDescription: "Queue positions, capacities, and statuses for pending generation projects by ISO.",
    usefulness: "It links pending projects to the utilities and territories already in the graph.",
    source: "https://example.com/queue-data",
    willingToModerate: true,
    ...overrides,
  };
}

describe("POST /api/v1/dataset-suggestions — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    // Two moderators available for notification.
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "mod-1" }, { id: "mod-2" }]),
      }),
    }));
  });

  it("rejects a missing email with 400", async () => {
    const res = await POST(makeRequest(validBody({ submitterEmail: undefined })) as never);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string; details?: { field?: string } } };
    expect(json.error?.details?.field).toBe("submitterEmail");
    expect(triggerModDatasetSuggestion).not.toHaveBeenCalled();
  });

  it("rejects a malformed email with 400", async () => {
    const res = await POST(makeRequest(validBody({ submitterEmail: "not-an-email" })) as never);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toContain("valid email");
    expect(triggerModDatasetSuggestion).not.toHaveBeenCalled();
  });

  it("rejects a missing datasetName with 400", async () => {
    const res = await POST(makeRequest(validBody({ datasetName: "  " })) as never);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { details?: { field?: string } } };
    expect(json.error?.details?.field).toBe("datasetName");
  });

  it("rejects a non-boolean willingToModerate with 400", async () => {
    const res = await POST(makeRequest(validBody({ willingToModerate: "yes" })) as never);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { details?: { field?: string } } };
    expect(json.error?.details?.field).toBe("willingToModerate");
  });

  it("rejects a non-JSON body with 400", async () => {
    const res = await POST(makeRequest("not json{") as never);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/dataset-suggestions — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isKnockConfigured).mockReturnValue(true);
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve([{ id: "mod-1" }, { id: "mod-2" }]),
      }),
    }));
  });

  it("accepts a valid payload with 200 and notifies moderators", async () => {
    const res = await POST(makeRequest(validBody()) as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { received?: boolean } };
    expect(json.data?.received).toBe(true);

    expect(triggerModDatasetSuggestion).toHaveBeenCalledTimes(1);
    const [moderatorIds, data] = vi.mocked(triggerModDatasetSuggestion).mock.calls[0];
    expect(moderatorIds).toEqual(["mod-1", "mod-2"]);
    expect(data).toMatchObject({
      submitterEmail: "jane@example.com",
      submitterName: "Jane Rivera",
      datasetName: "Interconnection queue positions",
      willingToModerate: true,
    });
  });

  it("treats optional fields as null when omitted", async () => {
    const res = await POST(
      makeRequest(validBody({ submitterName: undefined, source: undefined, willingToModerate: false })) as never
    );
    expect(res.status).toBe(200);
    const [, data] = vi.mocked(triggerModDatasetSuggestion).mock.calls[0];
    expect(data.submitterName).toBeNull();
    expect(data.source).toBeNull();
    expect(data.willingToModerate).toBe(false);
  });

  it("still returns 200 when no moderators exist (no trigger)", async () => {
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }));
    const res = await POST(makeRequest(validBody()) as never);
    expect(res.status).toBe(200);
    expect(triggerModDatasetSuggestion).not.toHaveBeenCalled();
  });

  it("still returns 200 when Knock is unconfigured (no DB query, no trigger)", async () => {
    vi.mocked(isKnockConfigured).mockReturnValue(false);
    const res = await POST(makeRequest(validBody()) as never);
    expect(res.status).toBe(200);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(triggerModDatasetSuggestion).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60,
      limit: 100,
      tier: "write",
    });
    const res = await POST(makeRequest(validBody()) as never);
    expect(res.status).toBe(429);
    expect(triggerModDatasetSuggestion).not.toHaveBeenCalled();
  });
});
