// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerProvider, useExplorer } from "@/components/explorer/ExplorerContext";

const navigation = vi.hoisted(() => ({ pathname: "/explore", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

let root: Root;
let container: HTMLDivElement;
let explorer: ReturnType<typeof useExplorer>;

function Capture() {
  explorer = useExplorer();
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  navigation.pathname = "/explore/utilities/vermont-electric-cooperative/programs/beat-the-peak";
  navigation.search = "mode=table&q=solar";
  window.history.replaceState(null, "", `${navigation.pathname}?${navigation.search}`);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("CommonGrid path adapter over the shared route controller", () => {
  it("seeds a nested URL, navigates back, and accepts external path changes", async () => {
    await act(async () =>
      root.render(
        <ExplorerProvider>
          <Capture />
        </ExplorerProvider>
      )
    );
    expect(explorer.stack.routes.map((route) => route.id)).toEqual([
      "overview",
      "list:utilities",
      "detail:utilities:vermont-electric-cooperative",
      "detail:programs:beat-the-peak",
    ]);
    expect(explorer.state.viewMode).toBe("table");

    await act(async () => explorer.goBack());
    expect(explorer.stack.current?.id).toBe("detail:utilities:vermont-electric-cooperative");
    expect(window.location.pathname).toBe("/explore/utilities/vermont-electric-cooperative");

    navigation.pathname = "/explore/programs";
    navigation.search = "";
    window.history.pushState(null, "", navigation.pathname);
    await act(async () =>
      root.render(
        <ExplorerProvider>
          <Capture />
        </ExplorerProvider>
      )
    );
    expect(explorer.stack.routes.map((route) => route.id)).toEqual(["overview", "list:programs"]);
    expect(explorer.state.viewMode).toBe("table");
  });
});

describe("EV station selection", () => {
  it("opens station details on the map from a filtered table and restores that table on Back", async () => {
    navigation.pathname = "/explore/ev-charging";
    navigation.search = "mode=table&q=Hudson&type=Tesla";
    await act(async () =>
      root.render(
        <ExplorerProvider>
          <Capture />
        </ExplorerProvider>
      )
    );
    await act(async () => explorer.navigateToDetail("ev-station", "10-hudson-yards"));
    expect(window.location.pathname).toBe("/explore/ev-charging/10-hudson-yards");
    expect(explorer.state.viewMode).toBe("map");
    expect(explorer.state.detailKind).toBe("ev-charging");
    await act(async () => explorer.goBack());
    expect(window.location.pathname).toBe("/explore/ev-charging");
    expect(explorer.state.viewMode).toBe("table");
    expect(explorer.state.q).toBe("Hudson");
    expect(explorer.state.type).toBe("Tesla");
  });

  it("seeds a station deep link and switches to another selected station", async () => {
    navigation.pathname = "/explore/ev-charging/10-hudson-yards-tesla-destination-new-york-ny";
    navigation.search = "";
    await act(async () =>
      root.render(
        <ExplorerProvider>
          <Capture />
        </ExplorerProvider>
      )
    );
    expect(explorer.state.viewMode).toBe("map");
    expect(explorer.state.slug).toBe("10-hudson-yards-tesla-destination-new-york-ny");
    await act(async () => explorer.navigateToDetail("ev-station", "x-gizmo-hayward-ca"));
    expect(window.location.pathname).toBe("/explore/ev-charging/x-gizmo-hayward-ca");
    expect(explorer.state.detailKind).toBe("ev-charging");
  });
});
