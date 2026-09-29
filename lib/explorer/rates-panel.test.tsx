// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewPanel } from "@/components/explorer/panels/OverviewPanel";
import { RateDetailPanel } from "@/components/explorer/panels/RateDetailPanel";
import { COUNT_ENDPOINTS } from "@/hooks/useEntityCounts";
import type { RateStructure } from "@/types/rate-structures";

const state = vi.hoisted(() => ({
  rate: null as RateStructure | null,
  setHighlight: vi.fn(),
  navigateToTab: vi.fn(),
}));
vi.mock("@/components/explorer/ExplorerContext", () => ({ useExplorer: () => state }));
vi.mock("@/hooks/useRate", () => ({ useRate: () => ({ rate: state.rate }) }));
vi.mock("@/components/contributions/EntityVersionHistory", () => ({ EntityVersionHistory: () => null }));
vi.mock("@texturehq/edges-explore/panel-atoms", () => ({
  PanelBucketRow: ({ label, count, onSelect }: { label: string; count: number; onSelect: () => void }) => (
    <button type="button" onClick={onSelect}>
      {label} {count}
    </button>
  ),
}));
const geometry = {
  type: "Polygon",
  coordinates: [
    [
      [-96, 41],
      [-95, 41],
      [-95, 42],
      [-96, 41],
    ],
  ],
};
const rate = (utilityId?: string): RateStructure => ({
  id: "rate-1",
  slug: "commercial",
  name: "#2 Commercial",
  utilityId,
  hasTou: false,
  hasDemandCharge: false,
  hasNetMetering: false,
  isEvRate: false,
  approved: true,
  isDefault: false,
  createdAt: "",
  updatedAt: "",
  version: 1,
});
const json = (data: unknown, ok = true) => Promise.resolve({ ok, json: async () => data });
const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;
async function render() {
  await act(async () => root.render(<RateDetailPanel slug="commercial" />));
}
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  root = createRoot(container);
  state.rate = rate("woodbine");
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("rate territory focus", () => {
  it("loads the selected utility's geometry and hands it to the map highlight", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("/geometry")
        ? json({ data: geometry })
        : json({ data: [{ id: "territory-woodbine" }], pagination: { hasMore: false } })
    );
    await render();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/territories?utilityId=woodbine&limit=200");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/territories/territory-woodbine/geometry");
    expect(state.setHighlight).toHaveBeenLastCalledWith({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry }],
    });
    act(() => root.render(null));
    expect(state.setHighlight).toHaveBeenLastCalledWith(null);
  });

  it("collects every page of utility territories", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/geometry")) return json({ data: geometry });
      return json({
        data: [{ id: "territory" }],
        pagination: url.includes("cursor=") ? { hasMore: false } : { hasMore: true, nextCursor: "page2" },
      });
    });
    await render();
    expect(fetchMock.mock.calls[2][0]).toContain("cursor=page2");
    expect(state.setHighlight.mock.lastCall?.[0].features).toHaveLength(2);
  });

  it("does not let a late response restore the previous rate's highlight", async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await render();
    const signal = fetchMock.mock.calls[0][1].signal;
    state.rate = rate();
    await render();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ ok: true, json: async () => ({ data: [], pagination: { hasMore: false } }) }));
    expect(state.setHighlight.mock.calls.every(([value]) => value === null)).toBe(true);
  });

  it.each(["missing", "error", "empty", "no-geometry"])("clears stale focus for %s territory data", async (mode) => {
    if (mode === "missing") state.rate = rate();
    fetchMock.mockImplementation((url: string) => {
      if (mode === "error") return Promise.reject(new Error("offline"));
      if (url.includes("/geometry")) return json({ data: null });
      return json({ data: mode === "empty" ? [] : [{ id: "territory" }], pagination: { hasMore: false } });
    });
    await render();
    expect(state.setHighlight).toHaveBeenLastCalledWith(null);
    if (mode === "missing") expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Rates overview bucket", () => {
  it("shows the public API total and navigates to the rates list", async () => {
    fetchMock.mockImplementation(() => json({ pagination: { total: 19372 } }));
    await act(async () => root.render(<OverviewPanel />));
    const button = [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Rates"));
    expect(button?.textContent).toBe("Rates 19372");
    act(() => button?.click());
    expect(state.navigateToTab).toHaveBeenCalledWith("rates");
    expect(COUNT_ENDPOINTS).toContainEqual({ key: "rates", path: "/api/v1/rates?limit=1" });
  });
});
