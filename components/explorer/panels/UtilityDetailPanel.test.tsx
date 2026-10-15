// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UtilityDetailPanel } from "./UtilityDetailPanel";

const state = vi.hoisted(() => ({
  utility: null as null | {
    id: string;
    slug: string;
    name: string;
    serviceTerritoryId: string | null;
    customerCount: number;
    segment: string;
    status: string;
    logo: string | null;
    jurisdiction: string | null;
    eiaId: string | null;
    website: string | null;
    peakDemandMw: number | null;
    nercRegion: string | null;
    parentId: string | null;
    successorId: string | null;
  },
  utilities: [] as Array<{
    id: string;
    slug: string;
    name: string;
    segment: string;
    customerCount: number;
    parentId: string | null;
    successorId: string | null;
  }>,
  setHighlight: vi.fn(),
  setSelectedUtilityId: vi.fn(),
  navigateToDetail: vi.fn(),
}));

vi.mock("@/components/explorer/ExplorerContext", () => ({
  useExplorer: () => ({
    navigateToDetail: state.navigateToDetail,
    setHighlight: state.setHighlight,
    setSelectedUtilityId: state.setSelectedUtilityId,
  }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ user: null }) }));
vi.mock("@/hooks/useUtility", () => ({ useUtility: () => ({ utility: state.utility, isLoading: false }) }));
vi.mock("@/hooks/useUtilityList", () => ({ useUtilityList: () => ({ utilities: state.utilities }) }));
vi.mock("@/hooks/useRegionList", () => ({ useRegionList: () => ({ regionById: new Map() }) }));
vi.mock("@/hooks/useIso", () => ({ useIso: () => ({ iso: null }) }));
vi.mock("@/hooks/useRto", () => ({ useRto: () => ({ rto: null }) }));
vi.mock("@/hooks/useBalancingAuthority", () => ({ useBalancingAuthority: () => ({ balancingAuthority: null }) }));
vi.mock("@/hooks/usePowerPlantList", () => ({ usePowerPlantList: () => ({ powerPlants: [] }) }));
vi.mock("@/hooks/useRateList", () => ({ useRateList: () => ({ rates: [] }) }));
vi.mock("@/hooks/useProgramList", () => ({ useProgramList: () => ({ programs: [], isLoading: false }) }));
vi.mock("@/components/contributions/EntityVersionHistory", () => ({ EntityVersionHistory: () => null }));
vi.mock("@/components/DownloadTerritoryButton", () => ({ DownloadTerritoryButton: () => null }));
vi.mock("@/components/skeletons", () => ({ DelayedEntityDetailSkeleton: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock("@clerk/nextjs", () => ({ SignInButton: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/explorer/geometry", () => ({ fetchTerritoryGeometry: vi.fn(() => Promise.resolve(null)) }));

let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.utility = {
    id: "utility-1",
    slug: "utility-one",
    name: "Utility One",
    serviceTerritoryId: null,
    customerCount: 0,
    segment: "DISTRIBUTION_COOPERATIVE",
    status: "active",
    logo: null,
    jurisdiction: null,
    eiaId: null,
    website: null,
    peakDemandMw: null,
    nercRegion: null,
    parentId: null,
    successorId: null,
  };
  state.utilities = [];
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("UtilityDetailPanel selection wiring", () => {
  it("publishes the active utility id to the shared explorer state and clears it on unmount", async () => {
    await act(async () => root.render(<UtilityDetailPanel slug="utility-one" />));
    expect(state.setSelectedUtilityId).toHaveBeenLastCalledWith("utility-1");
    act(() => root.unmount());
    expect(state.setSelectedUtilityId).toHaveBeenLastCalledWith(null);
  });
});
