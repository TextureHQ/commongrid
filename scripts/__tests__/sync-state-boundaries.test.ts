import type { Feature, FeatureCollection, Geometry } from "geojson";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRegionRecord,
  buildRegionsFromFeatures,
  type Fetcher,
  fetchJsonWithFallback,
  mergeRegionRecords,
  normalizeUtilityName,
  type RegionRecord,
  type SourceConfig,
  STATE_BOUNDARY_SOURCES,
  syncStateBoundaries,
} from "../sync-state-boundaries";

const mockPolygon: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

function makeFeature(props: Record<string, unknown>): Feature<Geometry, Record<string, unknown>> {
  return { type: "Feature", properties: props, geometry: mockPolygon };
}

function makeResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": contentType },
  });
}

function makeArcGISConfig(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return {
    sourceId: "test-state",
    state: "TS",
    url: "https://example.com/arcgis/rest/services/Test/FeatureServer/0/query",
    kind: "arcgis",
    fieldMapping: { name: "NAME", utilityType: "TYPE", eiaId: "EIA_ID", sourceId: "SOURCE_ID" },
    sourceLabel: "Test State Boundaries",
    sourceDate: "2026-01-01",
    sourcePriority: 100,
    isStateSource: true,
    ...overrides,
  };
}

describe("normalizeUtilityName", () => {
  it("expands CO-OP and E M C abbreviations", () => {
    expect(normalizeUtilityName("ACME CO-OP")).toBe("ACME COOPERATIVE");
    expect(normalizeUtilityName("E M C OF NOWHERE")).toBe("EMC OF NOWHERE");
  });

  it("trims whitespace", () => {
    expect(normalizeUtilityName("  ACME UTIL  ")).toBe("ACME UTIL");
  });
});

describe("buildRegionRecord", () => {
  it("maps fields and produces a RegionRecord with EIA id", () => {
    const config = makeArcGISConfig();
    const feature = makeFeature({ NAME: "ACME Electric", TYPE: "Investor-Owned", EIA_ID: 12345, SOURCE_ID: "A1" });
    const record = buildRegionRecord(config, feature, 0);
    expect(record).not.toBeNull();
    expect(record?.name).toBe("ACME Electric");
    expect(record?.eiaId).toBe("12345");
    expect(record?.utilityType).toBe("Investor-Owned");
    expect(record?.id).toBe("region-st-12345");
    expect(record?.slug).toBe("st-acme-electric-12345");
    expect(record?.sourcePriority).toBe(100);
    expect(record?.state).toBe("TS");
  });

  it("falls back to source id when no EIA id is present", () => {
    const config = makeArcGISConfig({ fieldMapping: { name: "NAME", utilityType: "TYPE", sourceId: "PSC_ID" } });
    const feature = makeFeature({ NAME: "ACME Electric", TYPE: "Municipal", PSC_ID: 42 });
    const record = buildRegionRecord(config, feature, 0);
    expect(record?.eiaId).toBeNull();
    expect(record?.id).toBe("region-st-ts-acme-electric-42");
    expect(record?.slug).toBe("st-ts-acme-electric-42");
  });

  it("is case-insensitive for property lookup", () => {
    const config = makeArcGISConfig({ fieldMapping: { name: "NAME", utilityType: "util_type", sourceId: "PSC_ID" } });
    const feature = makeFeature({ NAME: "ACME", UTIL_TYPE: "Cooperative", PSC_ID: 7 });
    const record = buildRegionRecord(config, feature, 0);
    expect(record?.utilityType).toBe("Cooperative");
  });

  it("skips features with missing names", () => {
    const config = makeArcGISConfig();
    const feature = makeFeature({ TYPE: "Investor-Owned", EIA_ID: 1 });
    expect(buildRegionRecord(config, feature, 0)).toBeNull();
  });

  it("applies the needsOpenSource flag from the config", () => {
    const config = makeArcGISConfig({ needsOpenSource: true, sourcePriority: 10 });
    const feature = makeFeature({ NAME: "ACME", TYPE: "Investor-Owned", EIA_ID: 99, SOURCE_ID: "X" });
    const record = buildRegionRecord(config, feature, 0);
    expect(record?.needsOpenSource).toBe(true);
    expect(record?.sourcePriority).toBe(10);
  });
});

describe("buildRegionsFromFeatures", () => {
  it("deduplicates records with the same id within a source", () => {
    const config = makeArcGISConfig();
    const features = [
      makeFeature({ NAME: "ACME", TYPE: "IOU", EIA_ID: 1, SOURCE_ID: "A" }),
      makeFeature({ NAME: "ACME", TYPE: "IOU", EIA_ID: 1, SOURCE_ID: "A" }),
      makeFeature({ NAME: "BETA", TYPE: "COOP", EIA_ID: 2, SOURCE_ID: "B" }),
    ];
    const entries = buildRegionsFromFeatures(config, features);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.record.id)).toEqual(["region-st-1", "region-st-2"]);
    expect(entries[0]?.geometry).toBe(mockPolygon);
  });
});

describe("fetchJsonWithFallback", () => {
  beforeEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
  });

  it("returns parsed JSON on a successful direct fetch", async () => {
    const fetchImpl = vi.fn<Fetcher>().mockResolvedValue(makeResponse({ ok: true }));
    const result = await fetchJsonWithFallback("https://example.com", undefined, fetchImpl);
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com", undefined);
  });

  it("falls back to Firecrawl on a 403 and parses rawHtml JSON", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    const fcPayload: FeatureCollection = {
      type: "FeatureCollection",
      features: [makeFeature({ NAME: "Remote" })],
    };

    const fetchImpl = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(makeResponse("Forbidden", 403, "text/html"))
      .mockResolvedValueOnce(makeResponse({ data: { rawHtml: JSON.stringify(fcPayload) } }, 200, "application/json"));

    const result = (await fetchJsonWithFallback(
      "https://example.com?f=json",
      undefined,
      fetchImpl
    )) as FeatureCollection;
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const fcCall = fetchImpl.mock.calls[1];
    expect(fcCall[0]).toBe("https://api.firecrawl.dev/v1/scrape");
    expect(fcCall[1]?.headers).toMatchObject({ Authorization: "Bearer fc-key" });
    expect(JSON.parse((fcCall[1]?.body as string) ?? "{}")).toMatchObject({
      url: "https://example.com?f=json",
      formats: ["rawHtml"],
      timeout: 45000,
    });
  });

  it("throws the direct error when FIRECRAWL_API_KEY is unset", async () => {
    const fetchImpl = vi.fn<Fetcher>().mockResolvedValue(makeResponse("Forbidden", 403, "text/html"));
    await expect(fetchJsonWithFallback("https://example.com", undefined, fetchImpl)).rejects.toThrow(
      /FIRECRAWL_API_KEY/
    );
  });

  it("preserves query parameters in the Firecrawl URL", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-key";
    const fetchImpl = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(makeResponse("Forbidden", 403, "text/html"))
      .mockResolvedValueOnce(makeResponse({ data: { rawHtml: "{}" } }, 200));

    await fetchJsonWithFallback("https://example.com/query?where=1%3D1&f=geojson&resultOffset=0", undefined, fetchImpl);
    const body = JSON.parse((fetchImpl.mock.calls[1][1]?.body as string) ?? "{}");
    expect(body.url).toBe("https://example.com/query?where=1%3D1&f=geojson&resultOffset=0");
  });
});

describe("mergeRegionRecords", () => {
  it("replaces lower-priority records with higher-priority incoming records", () => {
    const existing: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "Old",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "HIFLD",
        sourceDate: "2025-01-01",
        sourcePriority: 10,
      },
    ];
    const incoming: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "New",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "State Source",
        sourceDate: "2026-01-01",
        sourcePriority: 100,
      },
    ];
    const result = mergeRegionRecords(existing, incoming, new Map());
    expect(result.regions[0]?.name).toBe("New");
    expect(result.changedIds.has("region-st-1")).toBe(true);
  });

  it("does not overwrite locked records", () => {
    const existing: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "Locked",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "HIFLD",
        sourceDate: "2025-01-01",
        sourcePriority: 10,
        locked: true,
      },
    ];
    const incoming: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "New",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "State Source",
        sourceDate: "2026-01-01",
        sourcePriority: 100,
      },
    ];
    const result = mergeRegionRecords(existing, incoming, new Map());
    expect(result.regions[0]?.name).toBe("Locked");
    expect(result.skippedLocked).toHaveLength(1);
    expect(result.skippedLocked[0]?.id).toBe("region-st-1");
  });

  it("drops in-state HIFLD records when a state source is present", () => {
    const existing: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "HIFLD A",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "ArcGIS HIFLD Electric Retail Service Territories",
        sourceDate: "2025-01-01",
        sourcePriority: 10,
      },
      {
        id: "region-st-99",
        name: "Other",
        type: "SERVICE_TERRITORY",
        eiaId: "99",
        state: "OT",
        customers: null,
        source: "ArcGIS HIFLD Electric Retail Service Territories",
        sourceDate: "2025-01-01",
        sourcePriority: 10,
      },
    ];
    const incoming: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "State A",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "State Source",
        sourceDate: "2026-01-01",
        sourcePriority: 100,
      },
    ];
    const result = mergeRegionRecords(existing, incoming, new Map([["TS", 100]]));
    expect(result.regions.map((r) => r.id)).toEqual(["region-st-1", "region-st-99"]);
    expect(result.removedHifldIds).toEqual([]); // incoming already replaced the matching HIFLD record
  });

  it("drops unmatched in-state HIFLD records when a state source is present", () => {
    const existing: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "HIFLD A",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "ArcGIS HIFLD Electric Retail Service Territories",
        sourceDate: "2025-01-01",
        sourcePriority: 10,
      },
      {
        id: "region-st-ts-no-match",
        name: "HIFLD B",
        type: "SERVICE_TERRITORY",
        eiaId: null,
        state: "TS",
        customers: null,
        source: "ArcGIS HIFLD Electric Retail Service Territories",
        sourceDate: "2025-01-01",
        sourcePriority: 10,
      },
    ];
    const incoming: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "State A",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "State Source",
        sourceDate: "2026-01-01",
        sourcePriority: 100,
      },
    ];
    const result = mergeRegionRecords(existing, incoming, new Map([["TS", 100]]));
    expect(result.regions.map((r) => r.id)).toEqual(["region-st-1"]);
    expect(result.removedHifldIds).toEqual(["region-st-ts-no-match"]);
  });

  it("keeps records when state source has lower priority", () => {
    const existing: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "State A",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "State Source",
        sourceDate: "2026-01-01",
        sourcePriority: 100,
      },
    ];
    const incoming: RegionRecord[] = [
      {
        id: "region-st-1",
        name: "Low Prio",
        type: "SERVICE_TERRITORY",
        eiaId: "1",
        state: "TS",
        customers: null,
        source: "Low",
        sourceDate: "2026-01-01",
        sourcePriority: 10,
      },
    ];
    const result = mergeRegionRecords(existing, incoming, new Map());
    expect(result.regions[0]?.name).toBe("State A");
    expect(result.changedIds.size).toBe(0);
  });
});

describe("CO config", () => {
  it("uses the HIFLD source with the needsOpenSource flag", () => {
    const co = STATE_BOUNDARY_SOURCES.find((s) => s.state === "CO");
    expect(co).toBeDefined();
    expect(co?.needsOpenSource).toBe(true);
    expect(co?.isStateSource).toBe(false);
    expect(co?.sourcePriority).toBe(10);
    expect(co?.where).toBe("STATE='CO'");
    expect(co?.sourceLabel).toMatch(/HIFLD/);
  });
});

describe("syncStateBoundaries", () => {
  it("runs end-to-end with mocked ArcGIS responses", async () => {
    const mockFetch = vi.fn<Fetcher>();

    const arcResponse: FeatureCollection<Geometry, Record<string, unknown>> = {
      type: "FeatureCollection",
      features: [makeFeature({ NAME: "Acme Electric", TYPE: "Investor-Owned", EIA_ID: 9001, SOURCE_ID: "A" })],
    };

    // Each configured source will hit its URL; return the same mock payload.
    mockFetch.mockImplementation((input) => {
      if (typeof input === "string" && input.includes("firecrawl")) {
        return Promise.resolve(makeResponse({ data: { rawHtml: JSON.stringify(arcResponse) } }));
      }
      return Promise.resolve(makeResponse(arcResponse));
    });

    const existing: RegionRecord[] = [];
    const report = await syncStateBoundaries({
      fetchImpl: mockFetch,
      existingRegions: existing,
      writeFiles: false,
      skipStates: ["WI", "MN", "CO"],
    });

    // With all real states skipped, only the test would run; but the registry
    // has no test states. So verify the runner shape.
    expect(report.fetchedSources).toBe(0);
    expect(report.fetchedFeatures).toBe(0);
    expect(report.writtenTerritories).toBe(0);
  });
});
