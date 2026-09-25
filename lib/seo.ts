import type { Metadata } from "next";

// Never derive crawler-facing URLs from request headers or a preview hostname.
export const SITE_URL = "https://commongrid.info";
export const SITE_DESCRIPTION =
  "Explore the open, connected registry of the U.S. power grid: utilities, power plants, transmission lines, EV charging, and more.";
export const SOCIAL_IMAGE = {
  url: `${SITE_URL}/social-image`,
  width: 1200,
  height: 630,
  alt: "CommonGrid — The open, connected registry of the U.S. power grid",
};

export const homepageMetadata: Metadata = {
  // Do not apply the root layout's "%s - CommonGrid" template twice.
  title: { absolute: "CommonGrid" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    siteName: "CommonGrid",
    title: "CommonGrid",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "CommonGrid",
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
};

// Curated, public entry points only. No database dependency at build time, no
// invented lastModified dates, no account pages or unbounded filter combinations.
export const SITEMAP_PATHS = [
  "/",
  "/about",
  "/api",
  "/changelog",
  "/snapshots",
  "/explore",
  "/explore/utilities",
  "/explore/grid-operators",
  "/explore/programs",
  "/explore/power-plants",
  "/explore/transmission-lines",
  "/explore/ev-charging",
  "/explore/pricing-nodes",
  "/explore/substations",
] as const;

// Crawl hints for the sitemap. We deliberately do NOT emit lastModified — there
// is no build-time source of truth for per-page modification dates and inventing
// one would be misleading — so we express freshness via changeFrequency/priority.
export type SitemapChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export type SitemapCrawlHint = {
  changeFrequency: SitemapChangeFrequency;
  priority: number;
};

/**
 * Map a curated sitemap path to crawl hints. Data-backed explore surfaces update
 * frequently and rank highest after the homepage; static content pages change
 * rarely and rank lower. Every SITEMAP_PATHS entry resolves here; the trailing
 * default keeps this total for any future path.
 */
export function sitemapCrawlHint(path: string): SitemapCrawlHint {
  if (path === "/") return { changeFrequency: "daily", priority: 1.0 };
  if (path === "/explore" || path.startsWith("/explore/")) {
    return { changeFrequency: "daily", priority: 0.8 };
  }
  if (path === "/api") return { changeFrequency: "weekly", priority: 0.7 };
  if (path === "/changelog" || path === "/snapshots") {
    return { changeFrequency: "weekly", priority: 0.6 };
  }
  if (path === "/about") return { changeFrequency: "monthly", priority: 0.5 };
  return { changeFrequency: "weekly", priority: 0.5 };
}

const NON_INDEXABLE_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/auth",
  "/mod",
  "/settings",
  "/account",
  // Public overview and signed-in API-key dashboard share this URL.
  "/developers",
  "/components",
  "/contribute-dataset",
];

export function shouldNoIndex(pathname: string): boolean {
  return (
    NON_INDEXABLE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    pathname.split("/").includes("new")
  );
}
