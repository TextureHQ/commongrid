import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import SnapshotsPage from "./page";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/components/ContentPage", () => {
  const Container = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { ContentPage: Object.assign(Container, { Header: () => null, Body: Container }) };
});

const names = [
  "commongrid-2026-09-25.sql.gz",
  "utilities.geojson.gz",
  "transmission-lines.geojson.gz",
  "programs.json.gz",
  "rates.json.gz",
];
const assets = names.map((name) => ({
  name,
  size: 1024,
  // GitHub REST field, deliberately no download_url property.
  browser_download_url: `https://github.com/TextureHQ/commongrid/releases/download/snapshot/2026-W39/${name}`,
}));
const release = { tag_name: "snapshot/2026-W39", published_at: "2026-09-25T00:00:00Z", assets };

afterEach(() => vi.unstubAllGlobals());

describe("snapshot downloads", () => {
  it("renders actual GitHub asset URLs for SQL, GeoJSON and relational JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [release] }));
    const html = renderToStaticMarkup(await SnapshotsPage());
    for (const asset of assets) expect(html).toContain(`href="${asset.browser_download_url}"`);
    expect(html.match(/>Download<\/a>/g)).toHaveLength(assets.length);
    expect(html).toContain("Gzipped plain SQL");
    expect(html).not.toContain("PostgreSQL custom format");
    expect(html).toContain("JSON DATASETS");
  });

  it("does not invent assets for older releases or show non-snapshot releases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { ...release, assets: [assets[0]] },
          { ...release, tag_name: "v1.0.0" },
        ],
      })
    );
    const html = renderToStaticMarkup(await SnapshotsPage());
    expect(html.match(/>Download<\/a>/g)).toHaveLength(1);
    expect(html).not.toContain("JSON DATASETS");
  });

  it("renders an error rather than broken links when GitHub is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const html = renderToStaticMarkup(await SnapshotsPage());
    expect(html).toContain("GitHub API error: 503");
    expect(html).not.toContain(">Download</a>");
  });
});
