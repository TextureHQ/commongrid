import type { MetadataRoute } from "next";
import { SITE_URL, SITEMAP_PATHS, sitemapCrawlHint } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => {
    const { changeFrequency, priority } = sitemapCrawlHint(path);
    return { url: new URL(path, SITE_URL).href, changeFrequency, priority };
  });
}
