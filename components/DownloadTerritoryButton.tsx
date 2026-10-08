"use client";

import { Button } from "@texturehq/edges";
import { useState } from "react";

/** Download the canonical utility boundary, not the simplified map geometry. */
export function DownloadTerritoryButton({ slug }: { slug: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      // No simplify parameter: retain the full stored MultiPolygon and provenance.
      const response = await fetch(`/api/v1/utilities/${encodeURIComponent(slug)}/geometry`);
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Too many requests. Please wait a moment and try again."
            : "Could not download the territory. Please try again."
        );
      }
      const geojson = await response.json();
      if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
        throw new Error("Could not download the territory. Please try again.");
      }
      if (geojson.features.length === 0) {
        throw new Error("Territory GeoJSON is not available for this utility yet.");
      }

      const blob = new Blob([JSON.stringify(geojson)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug.replace(/[^a-zA-Z0-9_-]/g, "-")}-territory.geojson`;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        // Let the browser start the download before releasing its object URL.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download the territory. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" size="sm" onPress={download} isDisabled={downloading} aria-busy={downloading}>
        {downloading ? "Downloading…" : "Download territory GeoJSON"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-text-secondary">
          {error}
        </p>
      )}
    </div>
  );
}
