// @vitest-environment jsdom

import type { InteractiveMapProps } from "@texturehq/edges";
import { act, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerMap } from "@/components/explorer/ExplorerMap";
import { getEVStationHighlightGeoJSON } from "./ev-station-highlight";

const mocks = vi.hoisted(() => ({ flyTo: vi.fn(), navigateToDetail: vi.fn(), ready: true }));
const highlight = getEVStationHighlightGeoJSON({
  slug: "hudson-yards",
  stationName: "Hudson Yards",
  latitude: 40.752,
  longitude: -74.002,
});
let mapProps: InteractiveMapProps;
vi.mock("@texturehq/edges", () => ({
  layer: { geojson: (spec: object) => spec, vector: (spec: object) => spec },
  InteractiveMap: (props: InteractiveMapProps & { ref: React.Ref<unknown> }) => {
    mapProps = props;
    useImperativeHandle(props.ref, () => ({
      getMap: () =>
        mocks.ready
          ? {
              flyTo: mocks.flyTo,
              on: vi.fn(),
              off: vi.fn(),
              getLayer: vi.fn(),
              queryRenderedFeatures: vi.fn(() => []),
              getCanvas: () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }),
            }
          : null,
    }));
    return null;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/explorer/ExplorerContext", () => ({
  useExplorer: () => ({
    state: {
      highlightGeoJSON: highlight,
      detailKind: "ev-charging",
      segment: "all",
      q: "",
      type: "all",
      listSource: "ev-charging",
    },
    navigateToDetail: mocks.navigateToDetail,
  }),
}));
vi.mock("@/hooks/useAllPrograms", () => ({ useAllPrograms: () => ({ programs: [] }) }));
vi.mock("@/hooks/useRegionList", () => ({ useRegionList: () => ({ regionById: new Map() }) }));
vi.mock("@/hooks/useIsoList", () => ({ useIsoList: () => ({ isos: [] }) }));
vi.mock("@/hooks/useBalancingAuthorityList", () => ({
  useBalancingAuthorityList: () => ({ balancingAuthorities: [] }),
}));

let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.ready = true;
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<ExplorerMap mapboxAccessToken="test-token" />));
}

describe("EV station map selection", () => {
  it("zooms to street level and renders a selected point rather than a polygon fill", async () => {
    await render();
    expect(mocks.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-74.002, 40.752], zoom: 16 }));
    expect(mapProps.layers?.find((item) => item.id === "highlight")).toMatchObject({
      renderAs: "circle",
      data: highlight,
    });
  });
  it("focuses cached station data when the map finishes loading", async () => {
    mocks.ready = false;
    await render();
    expect(mocks.flyTo).not.toHaveBeenCalled();
    mocks.ready = true;
    act(() => mapProps.onLoad?.());
    expect(mocks.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-74.002, 40.752], zoom: 16 }));
  });
  it("routes a charger tile click through Explore", async () => {
    await render();
    const stationLayer = mapProps.layers?.find((item) => item.id === "ev-charging");
    act(() =>
      stationLayer?.events?.onClick?.({
        id: 1,
        lngLat: [-122, 37],
        layerId: "ev-charging",
        properties: { slug: "x-gizmo-hayward-ca" },
      })
    );
    expect(mocks.navigateToDetail).toHaveBeenCalledWith("ev-station", "x-gizmo-hayward-ca");
  });
});
