// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPanelLoading } from "@/components/explorer/panels/DetailPanelLoading";
import { RtoDetailPanel } from "@/components/explorer/panels/RtoDetailPanel";
import type { DetailView } from "./detail-view-tab";

vi.mock("@texturehq/edges", () => ({ Skeleton: () => <span data-edges-skeleton /> }));
vi.mock("@/components/contributions/EntityVersionHistory", () => ({ EntityVersionHistory: () => null }));
vi.mock("@/components/explorer/ExplorerContext", () => ({
  useExplorer: () => ({ navigateToDetail: () => {}, setHighlight: () => {} }),
}));
const request = vi.hoisted(() => ({ isLoading: true, rto: null as null | { name: string; states: string[] } }));
vi.mock("@/hooks/useRto", () => ({ useRto: () => request }));
vi.mock("@/hooks/useUtilityList", () => ({ useUtilityList: () => ({ utilities: [] }) }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  request.isLoading = true;
  request.rto = null;
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("entity-specific delayed skeletons", () => {
  it.each<[DetailView, number, boolean]>([
    ["utility", 5, false],
    ["iso", 3, true],
    ["rto", 4, true],
    ["ba", 5, false],
    ["program", 13, false],
    ["power-plant", 10, false],
    ["rate", 12, false],
  ])("matches the %s layout after 200 ms", (entity, rows, logo) => {
    act(() => root.render(<DetailPanelLoading entity={entity} />));
    act(() => vi.advanceTimersByTime(199));
    expect(container.querySelector("[data-detail-skeleton]")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector(`[data-detail-skeleton="${entity}"]`)).not.toBeNull();
    expect(container.querySelectorAll(".cg-explore-kv-row")).toHaveLength(rows);
    expect(container.querySelectorAll(".cg-explore-detail-logo")).toHaveLength(logo ? 1 : 0);
  });

  it("restarts the delay for a new slug and cancels on unmount", () => {
    act(() => root.render(<DetailPanelLoading entity="utility" key="first" />));
    act(() => vi.advanceTimersByTime(200));
    act(() => root.render(<DetailPanelLoading entity="utility" key="second" />));
    expect(container.querySelector("[data-detail-skeleton]")).toBeNull();
    act(() => vi.advanceTimersByTime(199));
    expect(container.querySelector("[data-detail-skeleton]")).toBeNull();
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });

  // Existing router prefers ISO for all current overlapping RTO slugs.
  // Mount the actual RTO panel directly rather than changing routing to test it.
  it("keeps RTO unavailable text hidden until its request resolves", () => {
    act(() => root.render(<RtoDetailPanel slug="test-rto" />));
    expect(container.textContent).not.toContain("not found");
    act(() => vi.advanceTimersByTime(200));
    expect(container.querySelector('[data-detail-skeleton="rto"]')).not.toBeNull();
    request.isLoading = false;
    act(() => root.render(<RtoDetailPanel slug="test-rto" />));
    expect(container.textContent).toContain("RTO not found");
    expect(container.querySelector("[data-detail-skeleton]")).toBeNull();
  });

  it("renders a fast RTO response without a skeleton", () => {
    act(() => root.render(<RtoDetailPanel slug="test-rto" />));
    request.rto = { name: "Test RTO", states: ["CA"] };
    request.isLoading = false;
    act(() => root.render(<RtoDetailPanel slug="test-rto" />));
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector(".cg-explore-detail-name")?.textContent).toBe("Test RTO");
    expect(container.querySelector("[data-detail-skeleton]")).toBeNull();
  });
});
