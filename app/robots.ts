import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep machine data/telemetry out of crawl budgets. Auth, moderation,
      // account and editor pages remain crawlable to receive X-Robots-Tag.
      disallow: ["/api/", "/tiles/", "/monitoring"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
