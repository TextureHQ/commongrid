import type { Feature, FeatureCollection, Geometry } from "geojson";
import { beforeEach, describe, expect, it, vi } from "vitest";
import utilities from "../../data/utilities.json";
import { VERMONT_UTILITY_EIA_IDS } from "../lib/vermont-utility-crosswalk";
import {
  buildRegionRecord,
  buildRegionSyncRecords,
  buildRegionsFromFeatures,
  type Fetcher,
  fetchJsonWithFallback,
  normalizeUtilityName,
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
    dataSourceId: "test-source",
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

describe("buildRegionSyncRecords", () => {
  it("maps a RegionEntry to a SyncRecord with only real regions columns", () => {
    const config = makeArcGISConfig();
    const feature = makeFeature({ NAME: "ACME Electric", TYPE: "Investor-Owned", EIA_ID: 12345, SOURCE_ID: "A1" });
    const entry = buildRegionsFromFeatures(config, [feature])[0];
    expect(entry).toBeDefined();

    const [sync] = buildRegionSyncRecords([entry]);
    expect(sync.entityId).toBe("region-st-12345");
    expect(sync.slug).toBe("st-acme-electric-12345");
    expect(sync.sourceId).toBe(config.dataSourceId);
    expect(sync.asOf).toEqual(new Date(config.sourceDate as string));

    expect(sync.fields).toHaveProperty("name", "ACME Electric");
    expect(sync.fields).toHaveProperty("type", "SERVICE_TERRITORY");
    expect(sync.fields).toHaveProperty("eiaId", "12345");
    expect(sync.fields).toHaveProperty("state", "TS");
    expect(sync.fields).toHaveProperty("source");
    expect(sync.fields).toHaveProperty("sourceUrl");
    expect(sync.fields).toHaveProperty("sourceDate");

    expect(sync.fields).not.toHaveProperty("sourcePriority");
    expect(sync.fields).not.toHaveProperty("needsOpenSource");
    expect(sync.fields).not.toHaveProperty("utilityType");
    expect(sync.fields).not.toHaveProperty("id");
    expect(sync.fields).not.toHaveProperty("slug");
  });

  it("falls back to a deterministic entityId when no EIA id is present", () => {
    const config = makeArcGISConfig({ fieldMapping: { name: "NAME", utilityType: "TYPE", sourceId: "PSC_ID" } });
    const feature = makeFeature({ NAME: "ACME Electric", TYPE: "Municipal", PSC_ID: 42 });
    const entry = buildRegionsFromFeatures(config, [feature])[0];
    expect(entry).toBeDefined();

    const [sync] = buildRegionSyncRecords([entry]);
    expect(sync.entityId).toBe("region-st-ts-acme-electric-42");
    expect(sync.fields).toHaveProperty("eiaId", null);
    expect(sync.sourceId).toBe(config.dataSourceId);
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
  it("runs end-to-end with mocked ArcGIS responses and no DB/manifest side effects", async () => {
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

    const report = await syncStateBoundaries({
      fetchImpl: mockFetch,
      publish: false,
      writeManifest: false,
      skipStates: ["WI", "MN", "CO"],
    });

    // With all real states skipped, the registry has nothing left to run.
    expect(report.fetchedSources).toBe(0);
    expect(report.fetchedFeatures).toBe(0);
    expect(report.regionsCreated).toBe(0);
    expect(report.territoriesUpserted).toBe(0);
    expect(report.errors).toEqual([]);
  });
});

describe("Vermont PSD (staged)", () => {
  const config = STATE_BOUNDARY_SOURCES.find((source) => source.state === "VT") as SourceConfig;

  it("keeps the source disabled until release gates are satisfied", async () => {
    expect(config.enabled).toBe(false);
    const fetchImpl = vi.fn<Fetcher>();
    const report = await syncStateBoundaries({
      fetchImpl,
      publish: false,
      writeManifest: false,
      skipStates: ["WI", "MN", "CO"],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(report.fetchedSources).toBe(0);
  });

  it("maps all 17 names to existing EIA-linked Vermont utility regions", () => {
    expect(Object.keys(VERMONT_UTILITY_EIA_IDS)).toHaveLength(17);
    expect(new Set(Object.values(VERMONT_UTILITY_EIA_IDS)).size).toBe(17);
    for (const [name, eiaId] of Object.entries(VERMONT_UTILITY_EIA_IDS)) {
      const utility = utilities.find((row) => row.eiaId === eiaId && row.jurisdiction === "VT");
      expect(utility).toBeDefined();
      const record = buildRegionRecord(config, makeFeature({ COMPANYNAM: name, OBJECTID: 99 }), 0);
      expect(record?.id).toBe(utility?.serviceTerritoryId);
      expect(record?.eiaId).toBe(eiaId);
    }
  });

  it("rejects unknown names rather than using source IDs or fuzzy matches", () => {
    expect(() => buildRegionRecord(config, makeFeature({ COMPANYNAM: "Unknown Utility", OBJECTID: 27316 }), 0)).toThrow(
      /unmapped utility name/
    );
  });

  it("does not invent a boundary date or import stale customer counts", () => {
    const entries = buildRegionsFromFeatures(config, [
      makeFeature({ COMPANYNAM: "Village of Stowe Electric Dept.", OBJECTID: 16, Customer_Num: 3386 }),
    ]);
    const [record] = buildRegionSyncRecords(entries);
    expect(record.entityId).toBe("region-st-27316");
    expect(record.sourceId).toBe("vt-psd");
    expect(record.asOf).toBeNull();
    expect(record.fields.sourceDate).toBeNull();
    expect(record.fields.customers).toBeNull();
  });
});
