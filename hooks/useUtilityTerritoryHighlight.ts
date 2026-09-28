"use client";

import type { FeatureCollection, Geometry } from "geojson";
import { useEffect } from "react";

/** Focus a utility's territories through the public API, without scanning utilities. */
export function useUtilityTerritoryHighlight(
  utilityId: string | undefined,
  setHighlight: (geoJSON: FeatureCollection | null) => void
) {
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setHighlight(null);

    if (utilityId) {
      async function load() {
        const features: FeatureCollection["features"] = [];
        let cursor: string | null = null;
        do {
          const params = new URLSearchParams({ utilityId: utilityId as string, limit: "200" });
          if (cursor) params.set("cursor", cursor);
          const response = await fetch(`/api/v1/territories?${params}`, { signal });
          if (!response.ok) throw new Error("Unable to load utility territories");
          const page = (await response.json()) as {
            data: { id: string }[];
            pagination: { hasMore: boolean; nextCursor: string | null };
          };
          const geometries = await Promise.all(
            page.data.map(async ({ id }) => {
              const response = await fetch(`/api/v1/territories/${encodeURIComponent(id)}/geometry`, { signal });
              if (!response.ok) return null;
              const body = (await response.json()) as { data: Geometry | null };
              return body.data;
            })
          );
          for (const geometry of geometries) {
            if (geometry) features.push({ type: "Feature", geometry, properties: {} });
          }
          cursor = page.pagination.hasMore ? page.pagination.nextCursor : null;
        } while (cursor && !signal.aborted);

        if (!signal.aborted && features.length) {
          setHighlight({ type: "FeatureCollection", features });
        }
      }
      // Missing territory data leaves the map unhighlighted; never reuse a previous rate's territory.
      load().catch(() => {
        if (!signal.aborted) setHighlight(null);
      });
    }

    return () => {
      controller.abort();
      setHighlight(null);
    };
  }, [utilityId, setHighlight]);
}
