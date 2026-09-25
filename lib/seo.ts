import type { Metadata } from "next";

// Never derive crawler-facing URLs from request headers or a preview hostname.
export const SITE_URL = "https://commongrid.info";
export const SITE_DESCRIPTION =
  "Explore the open, connected registry of the U.S. power grid: utilities, power plants, transmission lines, EV charging, and more.";
export const SOCIAL_IMAGE = {
  url: `${SITE_URL}/social-card.png`,
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
