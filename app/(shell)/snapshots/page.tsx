import { unstable_cache } from "next/cache";
import Link from "next/link";
import { ContentPage } from "@/components/ContentPage";

interface GHRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: Array<{
    name: string;
    size: number;
    download_url: string;
  }>;
}

const fetchSnapshots = unstable_cache(
  async () => {
    // Fetch all releases with snapshot/ tag prefix
    const response = await fetch("https://api.github.com/repos/TextureHQ/commongrid/releases", {
      headers: {
        Accept: "application/vnd.github.v3+json",
        // GitHub API requires User-Agent
        "User-Agent": "commongrid-app",
      },
      // Cache for 1 hour
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases: GHRelease[] = await response.json();

    // Filter to snapshot releases only and sort by date (newest first)
    return releases
      .filter((r) => r.tag_name.startsWith("snapshot/"))
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  },
  ["snapshots"],
  {
    tags: ["snapshots"],
    revalidate: 3600, // 1 hour
  }
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 10) / 10} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function parseWeekTag(tag: string): { year: number; week: number } {
  // snapshot/YYYY-WNN
  const match = tag.match(/snapshot\/(\d{4})-W(\d{2})/);
  if (!match) return { year: 2026, week: 0 };
  return { year: parseInt(match[1], 10), week: parseInt(match[2], 10) };
}

export default async function SnapshotsPage() {
  let snapshots: GHRelease[] = [];
  let error: string | null = null;

  try {
    snapshots = await fetchSnapshots();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load snapshots";
  }

  return (
    <ContentPage>
      <ContentPage.Header
        title="Database Snapshots"
        subtitle="Download the complete CommonGrid dataset as a PostgreSQL dump."
      />
      <ContentPage.Body>
        {/* Error state */}
        {error && (
          <div className="mb-8 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-300">
              <strong>Error:</strong> {error}
            </p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-2">
              Please try again later or{" "}
              <Link href="/" className="underline hover:no-underline">
                return home
              </Link>
              .
            </p>
          </div>
        )}

        {/* Empty state */}
        {!error && snapshots.length === 0 && (
          <div className="p-8 bg-background-muted border border-border-default rounded-lg text-center">
            <p className="text-text-body mb-2">No snapshots available yet.</p>
            <p className="text-sm text-text-caption">Weekly snapshots will start on Sunday. Check back soon.</p>
          </div>
        )}

        {/* Snapshots list */}
        {!error && snapshots.length > 0 && (
          <div className="space-y-6">
            {snapshots.map((release) => {
              const { year, week } = parseWeekTag(release.tag_name);
              const sqlAsset = release.assets.find((a) => a.name.endsWith(".sql.gz"));
              const geoJsonAssets = release.assets.filter((a) => a.name.endsWith(".geojson.gz"));
              const totalSize = release.assets.reduce((sum, a) => sum + a.size, 0);

              return (
                <div
                  key={release.tag_name}
                  className="border border-border-default rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  {/* Title & metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold text-text-heading mb-1">
                        Week {week}, {year}
                      </h3>
                      <p className="text-sm text-text-caption">{formatDate(release.published_at)}</p>
                    </div>
                    <div className="mt-2 sm:mt-0 flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-text-caption">Total size</p>
                        <p className="font-semibold text-text-heading">{formatBytes(totalSize)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Assets */}
                  <div className="space-y-3">
                    {/* SQL backup */}
                    {sqlAsset && (
                      <div className="bg-background-muted rounded p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-text-heading text-sm">💾 {sqlAsset.name}</p>
                          <p className="text-xs text-text-muted">
                            {formatBytes(sqlAsset.size)} • PostgreSQL custom format
                          </p>
                        </div>
                        <a
                          href={sqlAsset.download_url}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm transition-colors"
                        >
                          Download
                        </a>
                      </div>
                    )}

                    {/* GeoJSON assets */}
                    {geoJsonAssets.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-text-muted mb-2">GeoJSON DATA LAYERS</p>
                        <div className="space-y-2">
                          {geoJsonAssets.map((asset) => (
                            <div
                              key={asset.name}
                              className="bg-background-muted rounded p-3 flex items-center justify-between"
                            >
                              <div>
                                <p className="font-medium text-text-heading text-sm">
                                  🗺️ {asset.name.replace(".geojson.gz", "")}
                                </p>
                                <p className="text-xs text-text-muted">{formatBytes(asset.size)}</p>
                              </div>
                              <a
                                href={asset.download_url}
                                className="px-3 py-1.5 bg-background-muted hover:bg-background-hover text-text-heading rounded font-medium text-xs transition-colors"
                              >
                                Download
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info section */}
        <div className="mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">About these snapshots</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
            <li>
              <strong>SQL backups:</strong> Full database dumps in PostgreSQL custom format (.sql.gz)
            </li>
            <li>
              <strong>GeoJSON layers:</strong> Spatial data for utilities, charging stations, power plants, transmission
              lines, and pricing nodes
            </li>
            <li>
              <strong>Frequency:</strong> New snapshots every Sunday at 4:00 AM UTC
            </li>
            <li>
              <strong>Retention:</strong> All snapshots are permanent; none are deleted
            </li>
          </ul>
        </div>
      </ContentPage.Body>
    </ContentPage>
  );
}
