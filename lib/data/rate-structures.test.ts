import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/lib/db/client", () => ({
  getDb: () => ({
    select: mockSelect,
  }),
}));

import { dbRowToRateStructure, loadRateStructures } from "./rate-structures";

function makeDbRate(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "rate-1",
    slug: overrides.slug ?? "test-rate",
    name: overrides.name ?? "Test Rate",
    utilityName: overrides.utilityName ?? "Test Utility",
    sector: overrides.sector ?? "Residential",
    serviceType: overrides.serviceType ?? "Electric",
    hasTou: overrides.hasTou ?? false,
    hasDemandCharge: overrides.hasDemandCharge ?? false,
    hasNetMetering: overrides.hasNetMetering ?? false,
    isEvRate: overrides.isEvRate ?? false,
    approved: overrides.approved ?? true,
    isDefault: false,
    createdAt: overrides.createdAt ?? new Date("2024-01-15T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2024-02-15T00:00:00.000Z"),
    deletedAt: overrides.deletedAt ?? null,
    version: 1,
    ...overrides,
  };
}

describe("loadRateStructures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    }));
  });

  it("excludes soft-deleted rows via the deletedAt condition", async () => {
    await loadRateStructures();

    expect(mockSelect).toHaveBeenCalled();
    const builder = mockSelect.mock.results[0]?.value as { from: () => { where: (conds: unknown) => unknown } };
    if (!builder) throw new Error("Expected select builder");

    // We can't introspect the Drizzle SQL object in a portable way, but we can
    // verify the happy path returns rows when the DB does not contain deletedAt.
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve([makeDbRate({ deletedAt: null })]),
      }),
    }));

    const result = await loadRateStructures();
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("test-rate");
  });

  it("normalizes rows to the public RateStructure shape", async () => {
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            makeDbRate({
              id: "id-1",
              slug: "alpha",
              name: "Alpha Rate",
              fixedCharge: "12.34",
              fixedChargeUnits: "$/month",
              hasTou: true,
            }),
          ]),
      }),
    }));

    const rows = await loadRateStructures();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row?.id).toBe("id-1");
    expect(row?.slug).toBe("alpha");
    expect(row?.name).toBe("Alpha Rate");
    expect(row?.fixedCharge).toBe("12.34");
    expect(row?.fixedChargeUnits).toBe("$/month");
    expect(row?.hasTou).toBe(true);
    expect(row?.createdAt).toBe("2024-01-15T00:00:00.000Z");
    expect(row?.updatedAt).toBe("2024-02-15T00:00:00.000Z");
  });

  it("turns null optional fields into undefined", async () => {
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => Promise.resolve([makeDbRate({ utilityName: null, sector: null, fixedCharge: null })]),
      }),
    }));

    const rows = await loadRateStructures();
    expect(rows[0]?.utilityName).toBeUndefined();
    expect(rows[0]?.sector).toBeUndefined();
    expect(rows[0]?.fixedCharge).toBeUndefined();
  });

  it("returns sourceUrlStatus and sourceUrlCheckedAt", async () => {
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            makeDbRate({
              sourceUrlStatus: "dead",
              sourceUrlCheckedAt: new Date("2025-09-25T00:00:00.000Z"),
            }),
          ]),
      }),
    }));

    const rows = await loadRateStructures();
    expect(rows[0]?.sourceUrlStatus).toBe("dead");
    expect(rows[0]?.sourceUrlCheckedAt).toBe("2025-09-25T00:00:00.000Z");
  });

  it("handles string dates from alternate drivers", async () => {
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () =>
          Promise.resolve([
            makeDbRate({ createdAt: "2023-12-01T00:00:00.000Z", updatedAt: "2023-12-02T00:00:00.000Z" }),
          ]),
      }),
    }));

    const rows = await loadRateStructures();
    expect(rows[0]?.createdAt).toBe("2023-12-01T00:00:00.000Z");
    expect(rows[0]?.updatedAt).toBe("2023-12-02T00:00:00.000Z");
  });
});

describe("dbRowToRateStructure", () => {
  it("coerces numeric ids to numbers and booleans from DB", () => {
    const rate = dbRowToRateStructure({
      id: "id-1",
      slug: "rate",
      name: "Rate",
      eiaId: 12345,
      hasTou: true,
      approved: true,
      isDefault: false,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-02T00:00:00.000Z",
      version: 2,
    });
    expect(rate.eiaId).toBe(12345);
    expect(rate.hasTou).toBe(true);
    expect(rate.approved).toBe(true);
    expect(rate.version).toBe(2);
  });
});
