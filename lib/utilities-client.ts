"use client";

import { useEffect, useState } from "react";
import type { Utility } from "@/types/entities";

/**
 * Utilities data is loaded via fetch (not static import) to avoid
 * bundling 3.1 MB into Next.js client JS, which causes 15-20s load
 * times on the explore page.
 *
 * The JSON is served from /data/utilities.json (in public/).
 * The browser caches it after first load.
 */

let cachedUtilities: Utility[] | null = null;
let fetchPromise: Promise<Utility[]> | null = null;

async function fetchUtilities(): Promise<Utility[]> {
  if (cachedUtilities) return cachedUtilities;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/data/utilities.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load utilities: ${res.status}`);
      return res.json();
    })
    .then((data: Utility[]) => {
      cachedUtilities = data;
      return data;
    });

  return fetchPromise;
}

interface UseUtilitiesResult {
  utilities: Utility[];
  isLoading: boolean;
  error: string | null;
}

/**
 * React hook to load all utilities client-side.
 * Data is cached in memory after first fetch.
 */
export function useUtilities(): UseUtilitiesResult {
  const [utilities, setUtilities] = useState<Utility[]>(cachedUtilities ?? []);
  const [isLoading, setIsLoading] = useState(!cachedUtilities);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedUtilities) {
      setUtilities(cachedUtilities);
      setIsLoading(false);
      return;
    }

    fetchUtilities()
      .then((data) => {
        setUtilities(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  return { utilities, isLoading, error };
}

// Synchronous helpers for use after data is loaded

export function getUtilityBySlug(utilities: Utility[], slug: string): Utility | undefined {
  return utilities.find((u) => u.slug === slug);
}

export function getUtilityById(utilities: Utility[], id: string): Utility | undefined {
  return utilities.find((u) => u.id === id);
}

export function getUtilitiesByGenerationProvider(utilities: Utility[], providerId: string): Utility[] {
  return utilities.filter((u) => u.generationProviderId === providerId);
}

export function getUtilitiesByTransmissionProvider(utilities: Utility[], providerId: string): Utility[] {
  return utilities.filter((u) => u.transmissionProviderId === providerId);
}

export function getUtilitiesByParent(utilities: Utility[], parentId: string): Utility[] {
  return utilities.filter((u) => u.parentId === parentId);
}

export function searchUtilities(utilities: Utility[], query: string): Utility[] {
  const lower = query.toLowerCase();
  return utilities.filter((u) => u.name.toLowerCase().includes(lower) || u.slug.toLowerCase().includes(lower));
}

export function sortUtilities(utilities: Utility[], direction: "asc" | "desc" = "asc"): Utility[] {
  return [...utilities].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return direction === "asc" ? cmp : -cmp;
  });
}
