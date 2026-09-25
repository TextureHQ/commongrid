import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UrdbApiResponse, UrdbRate } from "../sync-urdb-rates";
import {
  buildSlug,
  deriveHasDemandCharge,
  deriveHasNetMetering,
  deriveHasTou,
  deriveIsEvRate,
  fetchUrdbRatesForSector,
  filterRates,
  hasRestrictiveLicense,
  isApproved,
  isCurrent,
  mapUrdbRateToSyncRecord,
  normalizeEiaId,
  syncUrdbRates,
  urdbTimestampToDate,
} from "../sync-urdb-rates";

function makeRate(overrides: Partial<UrdbRate> = {}): UrdbRate {
  return {
    label: "test-label-1",
    approved: true,
    eiaid: 12345,
    name: "Test Residential Rate",
    utility: "Test Utility Co",
    sector: "Residential",
    startdate: 1609459200, // 2021-01-01
    enddate: null,
    is_default: false,
    description: "A test rate",
    fixedchargefirstmeter: 10,
    fixedchargeunits: "$/month",
    energyratestructure: [[{ rate: 0.12 }]],
    energyweekdayschedule: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    energyweekendschedule: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    demandratestructure: null,
    flatdemandstructure: null,
    demandrateunit: null,
    dgrules: null,
    source: "https://example.com/rate",
    sourceparent: null,
    ...overrides,
  };
}

function makeResolver(eiaIds: number[] = [12345]) {
  return {
    utilityIdByEiaId: new Map(eiaIds.map((id) => [String(id), `utility-${id}`])),
    regionIdByEiaId: new Map(eiaIds.map((id) => [String(id), `region-${id}`])),
  };
}

function makeResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": contentType },
  });
}

describe("normalizeEiaId", () => {
  it("stringifies numbers and trims strings", () => {
    expect(normalizeEiaId(12345)).toBe("12345");
    expect(normalizeEiaId(" 12345 ")).toBe("12345");
    expect(normalizeEiaId(null)).toBeNull();
    expect(normalizeEiaId("")).toBeNull();
  });
});

describe("urdbTimestampToDate", () => {
  it("converts unix seconds to a Date", () => {
    const date = urdbTimestampToDate(1609459200);
    expect(date).not.toBeNull();
    expect(date?.toISOString()).toBe("2021-01-01T00:00:00.000Z");
  });

  it("returns null for missing or invalid values", () => {
    expect(urdbTimestampToDate(null)).toBeNull();
    expect(urdbTimestampToDate("")).toBeNull();
    expect(urdbTimestampToDate(Number.NaN)).toBeNull();
  });
});

describe("isApproved", () => {
  it("returns true only for explicit true", () => {
    expect(isApproved(makeRate({ approved: true }))).toBe(true);
    expect(isApproved(makeRate({ approved: false }))).toBe(false);
  });
});

describe("isCurrent", () => {
  it("returns true when enddate is null", () => {
    expect(isCurrent(makeRate({ enddate: null }), 1_700_000_000)).toBe(true);
  });

  it("returns true when enddate is in the future", () => {
    expect(isCurrent(makeRate({ enddate: 1_800_000_000 }), 1_700_000_000)).toBe(true);
  });

  it("returns false when enddate is in the past", () => {
    expect(isCurrent(makeRate({ enddate: 1_600_000_000 }), 1_700_000_000)).toBe(false);
  });
});

describe("hasRestrictiveLicense", () => {
  it("returns false for plain CC0-style URDB source URLs", () => {
    expect(hasRestrictiveLicense(makeRate({ source: "https://utility.com/rates" }))).toBe(false);
  });

  it("flags records with explicit non-CC0 language", () => {
    expect(hasRestrictiveLicense(makeRate({ source: "All rights reserved. Do not redistribute." }))).toBe(true);
    expect(hasRestrictiveLicense(makeRate({ sourceparent: "Licensed under CC BY-NC 4.0" }))).toBe(true);
    expect(hasRestrictiveLicense(makeRate({ source: "Proprietary rate filing" }))).toBe(true);
  });
});

describe("deriveHasTou", () => {
  it("returns false for single-period schedules", () => {
    expect(deriveHasTou(makeRate())).toBe(false);
  });

  it("returns true when weekday schedule references multiple periods", () => {
    const schedule = [[0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]];
    expect(deriveHasTou(makeRate({ energyweekdayschedule: schedule }))).toBe(true);
  });

  it("returns true when weekend schedule references multiple periods", () => {
    const schedule = [[0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
    expect(deriveHasTou(makeRate({ energyweekendschedule: schedule }))).toBe(true);
  });
});

describe("deriveHasDemandCharge", () => {
  it("returns false when no demand structure has a positive rate", () => {
    expect(deriveHasDemandCharge(makeRate())).toBe(false);
    expect(deriveHasDemandCharge(makeRate({ demandratestructure: [[{ rate: 0 }]] }))).toBe(false);
  });

  it("returns true for positive demand rates", () => {
    expect(deriveHasDemandCharge(makeRate({ demandratestructure: [[{ rate: 12.5 }]] }))).toBe(true);
  });

  it("returns true for positive flat demand rates", () => {
    expect(deriveHasDemandCharge(makeRate({ flatdemandstructure: [[{ rate: 3 }]] }))).toBe(true);
  });
});

describe("deriveHasNetMetering", () => {
  it("returns false when dgrules is absent", () => {
    expect(deriveHasNetMetering(makeRate())).toBe(false);
  });

  it("returns true when dgrules contains net-metering keys", () => {
    expect(deriveHasNetMetering(makeRate({ dgrules: { "net-metering": true } }))).toBe(true);
    expect(deriveHasNetMetering(makeRate({ dgrules: { dgRules: "Net metering available" } }))).toBe(true);
  });
});

describe("deriveIsEvRate", () => {
  it("returns true for EV heuristic matches", () => {
    expect(deriveIsEvRate(makeRate({ name: "EV Time-of-Use Rate" }))).toBe(true);
    expect(deriveIsEvRate(makeRate({ description: "For electric vehicle charging" }))).toBe(true);
    expect(deriveIsEvRate(makeRate({ name: "PEV Overnight" }))).toBe(true);
  });

  it("returns false for non-EV rates", () => {
    expect(deriveIsEvRate(makeRate())).toBe(false);
    expect(deriveIsEvRate(makeRate({ name: "Residential Service" }))).toBe(false);
  });
});

describe("buildSlug", () => {
  it("is stable and includes the label suffix", () => {
    expect(buildSlug("Test Utility Co", "Residential Rate", "abc123")).toBe("test-utility-co-residential-rate-abc123");
  });
});

describe("mapUrdbRateToSyncRecord", () => {
  it("maps a valid rate to a SyncRecord", () => {
    const record = mapUrdbRateToSyncRecord(makeRate(), makeResolver());
    expect(record).not.toBeNull();
    expect(record?.entityId).toBe("rate-test-label-1");
    expect(record?.sourceId).toBe("urdb");
    expect(record?.slug).toBe("test-utility-co-test-residential-rate-test-label-1");
    expect(record?.fields.eiaId).toBe(12345);
    expect(record?.fields.utilityId).toBe("utility-12345");
    expect(record?.fields.regionId).toBe("region-12345");
    expect(record?.fields.hasTou).toBe(false);
    expect(record?.fields.isEvRate).toBe(false);
  });

  it("returns null when eiaid is missing", () => {
    expect(mapUrdbRateToSyncRecord(makeRate({ eiaid: null as unknown as number }), makeResolver())).toBeNull();
  });
});

describe("filterRates", () => {
  it("keeps approved, current rates for known utilities", () => {
    const rates = [makeRate()];
    const { result, unapproved, expired, license, unknownUtility } = filterRates(rates, makeResolver(), 1_700_000_000);
    expect(result).toHaveLength(1);
    expect(unapproved).toBe(0);
    expect(expired).toBe(0);
    expect(license).toBe(0);
    expect(unknownUtility).toBe(0);
  });

  it("filters unapproved rates", () => {
    const rates = [makeRate({ approved: false })];
    const { result, unapproved } = filterRates(rates, makeResolver(), 1_700_000_000);
    expect(result).toHaveLength(0);
    expect(unapproved).toBe(1);
  });

  it("filters expired rates", () => {
    const rates = [makeRate({ enddate: 1_600_000_000 })];
    const { result, expired } = filterRates(rates, makeResolver(), 1_700_000_000);
    expect(result).toHaveLength(0);
    expect(expired).toBe(1);
  });

  it("filters rates for unknown utilities", () => {
    const rates = [makeRate({ eiaid: 99999 })];
    const { result, unknownUtility } = filterRates(rates, makeResolver(), 1_700_000_000);
    expect(result).toHaveLength(0);
    expect(unknownUtility).toBe(1);
  });

  it("flags an EV rate and a TOU rate in the kept set", () => {
    const rates = [
      makeRate({
        label: "ev",
        name: "EV Rate",
        energyweekdayschedule: [[0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      }),
      makeRate({
        label: "tou",
        energyweekdayschedule: [[0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      }),
    ];
    const { result } = filterRates(rates, makeResolver(), 1_700_000_000);
    expect(result).toHaveLength(2);
    const ev = result.find((r) => r.entityId === "rate-ev");
    const tou = result.find((r) => r.entityId === "rate-tou");
    expect(ev?.fields.isEvRate).toBe(true);
    expect(ev?.fields.hasTou).toBe(true);
    expect(tou?.fields.hasTou).toBe(true);
  });
});

describe("fetchUrdbRatesForSector", () => {
  beforeEach(() => {
    delete process.env.NREL_API_KEY;
  });

  it("paginates until a partial page is returned", async () => {
    const fetchImpl = vi.fn().mockImplementation((input) => {
      const url = new URL(input as string);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      const items = Array.from({ length: offset === 0 ? limit : 2 }, (_, i) =>
        makeRate({ label: `label-${offset + i}`, eiaid: 12345 + offset + i })
      );
      return Promise.resolve(makeResponse({ items }));
    });

    const { rates } = await fetchUrdbRatesForSector("Residential", "DEMO_KEY", fetchImpl, { limit: 3 });
    expect(rates).toHaveLength(5);
    expect(rates[0]?.label).toBe("label-0");
    expect(rates[4]?.label).toBe("label-4");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws on non-ok responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({ error: "bad" }, 500));
    await expect(fetchUrdbRatesForSector("Residential", "DEMO_KEY", fetchImpl, { limit: 2 })).rejects.toThrow(
      /URDB fetch failed/
    );
  });
});

describe("syncUrdbRates", () => {
  beforeEach(() => {
    delete process.env.NREL_API_KEY;
  });

  it("runs end-to-end with mocked URDB responses and no DB/manifest side effects", async () => {
    const mockFetch = vi.fn().mockImplementation((input) => {
      const url = new URL(input as string);
      const sector = url.searchParams.get("sector");
      const response: UrdbApiResponse = {
        items: [makeRate({ sector: sector ?? "Residential", label: `label-${sector}` })],
      };
      return Promise.resolve(makeResponse(response));
    });

    const report = await syncUrdbRates({
      fetchImpl: mockFetch,
      sectors: ["Residential"],
      apiKey: "DEMO_KEY",
      dryRun: true,
      writeManifest: false,
    });

    expect(report.fetchedRates).toBe(1);
    expect(report.keptRates).toBe(0); // unknown utility because no DB
    expect(report.skippedUnknownUtility).toBe(1);
    expect(report.errors).toEqual([]);
  });
});
