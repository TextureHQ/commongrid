import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { buildMetadata } from "@/lib/metadata";
import { homepageMetadata, SITE_URL, SITEMAP_PATHS, SOCIAL_IMAGE, shouldNoIndex, sitemapCrawlHint } from "@/lib/seo";

const VALID_CHANGE_FREQUENCIES = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);

// Protect route boundaries: root metadata must not canonicalize every entity
// page to the homepage, and a shared OG image must not erase entity titles.
describe("launch metadata", () => {
  it("uses absolute production URLs and a large social card on the homepage", () => {
    expect(homepageMetadata.title).toEqual({ absolute: "CommonGrid" });
    expect(homepageMetadata.alternates?.canonical).toBe(SITE_URL);
    expect(homepageMetadata.openGraph).toMatchObject({ url: SITE_URL, images: [SOCIAL_IMAGE] });
    expect(homepageMetadata.twitter).toMatchObject({ card: "summary_large_image", images: [SOCIAL_IMAGE] });
    expect(SOCIAL_IMAGE.url).toBe(`${SITE_URL}/social-image`);
    expect(SOCIAL_IMAGE).toMatchObject({ width: 1200, height: 630 });
  });

  it("preserves entity titles/descriptions with a shared image but no homepage canonical", () => {
    const metadata = buildMetadata({ title: "Palo Verde", section: "Power Plants", description: "Plant details" });
    expect(metadata.title).toBe("Palo Verde - Power Plants");
    expect(metadata.openGraph).toMatchObject({
      title: "Palo Verde - Power Plants",
      description: "Plant details",
      images: [SOCIAL_IMAGE],
    });
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty("url");
  });

  it("lists only unique public production entry points, without invented modification dates", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(SITEMAP_PATHS.length);
    expect(new Set(entries.map(({ url }) => url)).size).toBe(entries.length);
    for (const entry of entries) {
      const url = new URL(entry.url);
      expect(url.origin).toBe(SITE_URL);
      expect(url.search).toBe("");
      expect(shouldNoIndex(url.pathname)).toBe(false);
      expect(entry.lastModified).toBeUndefined();
    }
  });

  it("emits valid crawl hints (priority in [0,1] and a known changeFrequency) for every entry", () => {
    const entries = sitemap();
    for (const entry of entries) {
      expect(typeof entry.priority).toBe("number");
      expect(entry.priority).toBeGreaterThanOrEqual(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
      expect(VALID_CHANGE_FREQUENCIES.has(entry.changeFrequency as string)).toBe(true);
    }
  });

  it("ranks the homepage highest and explore surfaces above static content", () => {
    const byPath = new Map(sitemap().map((entry) => [new URL(entry.url).pathname, entry]));
    expect(byPath.get("/")?.priority).toBe(1.0);
    expect(byPath.get("/")?.changeFrequency).toBe("daily");
    expect(byPath.get("/explore")?.priority).toBe(0.8);
    expect(byPath.get("/explore/utilities")?.priority).toBe(0.8);
    expect(byPath.get("/explore/utilities")?.changeFrequency).toBe("daily");
    expect(byPath.get("/api")?.priority).toBe(0.7);
    expect(byPath.get("/about")?.priority).toBe(0.5);
    expect(byPath.get("/about")?.changeFrequency).toBe("monthly");
    // Explore data surfaces should outrank static content pages.
    expect(byPath.get("/explore/utilities")?.priority ?? 0).toBeGreaterThan(byPath.get("/about")?.priority ?? 1);
  });

  it("resolves crawl hints for every curated sitemap path", () => {
    for (const path of SITEMAP_PATHS) {
      const hint = sitemapCrawlHint(path);
      expect(hint.priority).toBeGreaterThanOrEqual(0);
      expect(hint.priority).toBeLessThanOrEqual(1);
      expect(VALID_CHANGE_FREQUENCIES.has(hint.changeFrequency)).toBe(true);
    }
  });

  it("allows page crawling to discover noindex directives but excludes API/tile data", () => {
    const result = robots();
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(result.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/api/", "/tiles/", "/monitoring"] });
  });

  it.each([
    "/sign-in",
    "/sign-in/sso-callback",
    "/sign-up",
    "/auth/signup",
    "/mod",
    "/mod/users",
    "/mod/contributions/123",
    "/developers",
    "/settings",
    "/account/profile",
    "/components",
    "/contribute-dataset",
    "/power-plants/new",
    "/programs/new",
    "/grid-operators/new/iso",
  ])("excludes private, auth, demo and editor surface %s from indexing", (pathname) => {
    expect(shouldNoIndex(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/about",
    "/api",
    "/explore",
    "/explore/utilities/new-york",
    "/power-plants/new-haven",
    "/contributions",
  ])("keeps public route %s indexable", (pathname) => {
    expect(shouldNoIndex(pathname)).toBe(false);
  });
});
