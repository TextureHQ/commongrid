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

function mockSelectWithRows(rows: Record<string, unknown>[], totalCount = rows.length) {
  mockSelect.mockImplementation((fields: Record<string, unknown>) => {
    if (fields && "count" in fields) {
      return {
        from: () => ({
          where: () => Promise.resolve([{ count: totalCount }]),
        }),
      };
    }
    return {
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(rows),
          }),
        }),
      }),
    };
  });
}

describe("loadRateStructures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWithRows([]);
  });

  it("excludes soft-deleted rows via the deletedAt condition", async () => {
    await loadRateStructures();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("normalizes rows to the public RateStructure shape", async () => {
    mockSelectWithRows([
      makeDbRate({
        id: "id-1",
        slug: "alpha",
        name: "Alpha Rate",
        fixedCharge: "12.34",
        fixedChargeUnits: "$/month",
        hasTou: true,
      }),
    ]);

    const { items } = await loadRateStructures();
    expect(items).toHaveLength(1);

    const row = items[0];
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
    mockSelectWithRows([makeDbRate({ utilityName: null, sector: null, fixedCharge: null })]);

    const { items } = await loadRateStructures();
    expect(items[0]?.utilityName).toBeUndefined();
    expect(items[0]?.sector).toBeUndefined();
    expect(items[0]?.fixedCharge).toBeUndefined();
  });

  it("returns sourceUrlStatus and sourceUrlCheckedAt", async () => {
    mockSelectWithRows([
      makeDbRate({
        sourceUrlStatus: "dead",
        sourceUrlCheckedAt: new Date("2025-09-25T00:00:00.000Z"),
      }),
    ]);

    const { items } = await loadRateStructures();
    expect(items[0]?.sourceUrlStatus).toBe("dead");
    expect(items[0]?.sourceUrlCheckedAt).toBe("2025-09-25T00:00:00.000Z");
  });

  it("handles string dates from alternate drivers", async () => {
    mockSelectWithRows([makeDbRate({ createdAt: "2023-12-01T00:00:00.000Z", updatedAt: "2023-12-02T00:00:00.000Z" })]);

    const { items } = await loadRateStructures();
    expect(items[0]?.createdAt).toBe("2023-12-01T00:00:00.000Z");
    expect(items[0]?.updatedAt).toBe("2023-12-02T00:00:00.000Z");
  });

  it("does not select the heavy jsonb columns in the list query", async () => {
    mockSelectWithRows([makeDbRate({ id: "rate-1" })]);

    await loadRateStructures();

    const rowSelectCall = mockSelect.mock.calls.find(
      (call) => call[0] && typeof call[0] === "object" && "id" in (call[0] as Record<string, unknown>)
    ) as [Record<string, boolean | undefined>, ...unknown[]] | undefined;
    expect(rowSelectCall).toBeDefined();
    if (!rowSelectCall) return;
    const selected = rowSelectCall[0];
    expect("id" in selected).toBe(true);
    expect("name" in selected).toBe(true);
    expect("energyRateStructure" in selected).toBe(false);
    expect("energyWeekdaySchedule" in selected).toBe(false);
    expect("energyWeekendSchedule" in selected).toBe(false);
    expect("demandRateStructure" in selected).toBe(false);
    expect("flatDemandStructure" in selected).toBe(false);
    expect("netMeteringRules" in selected).toBe(false);
  });

  it("reports totalCount from the count query", async () => {
    mockSelectWithRows([makeDbRate({ id: "rate-1" }), makeDbRate({ id: "rate-2" })], 42);

    const { items, totalCount } = await loadRateStructures();
    expect(items).toHaveLength(2);
    expect(totalCount).toBe(42);
  });

  it("computes hasMore from the limit + 1 sentinel", async () => {
    mockSelectWithRows([makeDbRate({ id: "rate-1" }), makeDbRate({ id: "rate-2" }), makeDbRate({ id: "rate-3" })], 3);

    const { items, hasMore } = await loadRateStructures({ limit: 2 });
    expect(items).toHaveLength(2);
    expect(hasMore).toBe(true);
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
