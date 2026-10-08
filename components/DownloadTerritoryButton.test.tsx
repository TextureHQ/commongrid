// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadTerritoryButton } from "./DownloadTerritoryButton";

vi.mock("@texturehq/edges", () => ({
  Button: ({
    variant: _variant,
    size: _size,
    onPress,
    isDisabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant: string;
    size: string;
    onPress: () => void;
    isDisabled: boolean;
  }) => <button {...props} onClick={onPress} disabled={isDisabled} />,
}));

const collection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { utility_slug: "example-utility" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
      },
    },
  ],
  metadata: { geometry_status: "loaded", source: "HIFLD", source_url: "https://example.org/source" },
};
let root: Root;
let container: HTMLDivElement;
let saved: { filename: string; href: string }[];
const fetchMock = vi.fn();
const createObjectURL = vi.fn((_blob: Blob) => "blob:territory");
const revokeObjectURL = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
  saved = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ filename: this.download, href: this.href });
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<DownloadTerritoryButton slug="example-utility" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

async function click() {
  await act(async () => container.querySelector("button")?.click());
}

describe("DownloadTerritoryButton", () => {
  it("downloads full-resolution GeoJSON including provenance and releases the object URL", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fetchMock.mockResolvedValue(Response.json(collection));
    await click();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/utilities/example-utility/geometry");
    expect(saved).toEqual([{ filename: "example-utility-territory.geojson", href: "blob:territory" }]);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/geo+json");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(JSON.parse(text)).toEqual(collection);
    expect(document.querySelector("a[download]")).toBeNull();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:territory");
  });

  it("disables duplicate clicks while fetching", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      })
    );
    await click();
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.textContent).toContain("Downloading…");
    await act(async () => resolve(Response.json(collection)));
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it("explains missing geometry instead of saving an empty file", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...collection, features: [] }));
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("not available for this utility yet");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it.each([404, 500, 429])("handles HTTP %s without saving an error document", async (status) => {
    fetchMock.mockResolvedValue(new Response("error", { status }));
    await click();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      status === 429 ? "Too many requests" : "Could not download"
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("allows retry after a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));
    await click();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    fetchMock.mockResolvedValue(Response.json(collection));
    await click();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(saved).toHaveLength(1);
  });

  it("rejects malformed successful responses", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: null }));
    await click();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(saved).toHaveLength(0);
  });

  it("is wired into both utility surfaces with the resolved canonical slug", () => {
    for (const path of ["./explorer/panels/UtilityDetailPanel.tsx", "../app/(shell)/grid-operators/[slug]/page.tsx"]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      const button = "<DownloadTerritoryButton key={utility.slug} slug={utility.slug} />";
      expect(source.split(button)).toHaveLength(2);
      // The download is the final content, after every section and the panel's full-page link.
      expect(source.slice(source.indexOf(button) + button.length).trim()).toMatch(
        /^(?:<\/div>\s*)+(?:<\/>\s*)?\);\s*}\s*$/
      );
    }
  });
});
