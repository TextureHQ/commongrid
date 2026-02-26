"use client";

import { useState, useEffect } from "react";
import type { EVStation } from "@/types/ev-charging";

/**
 * EV charging station data is loaded via fetch (not static import) to avoid
 * bundling a large JSON into Next.js pre-rendered pages.
 *
 * The JSON is served from /data/ev-charging.json (copied to public/ at build time).
 */

let cachedStations: EVStation[] | null = null;
let fetchPromise: Promise<EVStation[]> | null = null;

async function fetchEvCharging(): Promise<EVStation[]> {
  if (cachedStations) return cachedStations;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/data/ev-charging.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load EV charging data: ${res.status}`);
      return res.json();
    })
    .then((data: EVStation[]) => {
      cachedStations = data;
      return data;
    });

  return fetchPromise;
}

interface UseEvChargingResult {
  stations: EVStation[];
  isLoading: boolean;
  error: string | null;
}

/**
 * React hook to load all EV charging stations client-side.
 * Data is cached in memory after first fetch.
 */
export function useEvCharging(): UseEvChargingResult {
  const [stations, setStations] = useState<EVStation[]>(cachedStations ?? []);
  const [isLoading, setIsLoading] = useState(!cachedStations);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedStations) {
      setStations(cachedStations);
      setIsLoading(false);
      return;
    }

    fetchEvCharging()
      .then((data) => {
        setStations(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  return { stations, isLoading, error };
}

/**
 * Hook to load a single EV station by slug.
 */
export function useEvStation(slug: string): { station: EVStation | null; isLoading: boolean } {
  const { stations, isLoading } = useEvCharging();
  const station = stations.find((s) => s.slug === slug) ?? null;
  return { station, isLoading };
}
