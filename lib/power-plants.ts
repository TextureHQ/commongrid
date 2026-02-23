"use client";

import { useState, useEffect } from "react";
import type { PowerPlant } from "@/types/entities";

/**
 * Power plant data is loaded via fetch (not static import) to avoid
 * bundling 8.7 MB into Next.js pre-rendered pages, which exceeds
 * Vercel's 19 MB ISR page size limit.
 *
 * The JSON is served from /data/power-plants.json (copied to public/
 * at build time). The browser caches it after first load.
 */

let cachedPlants: PowerPlant[] | null = null;
let fetchPromise: Promise<PowerPlant[]> | null = null;

async function fetchPowerPlants(): Promise<PowerPlant[]> {
  if (cachedPlants) return cachedPlants;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/data/power-plants.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load power plants: ${res.status}`);
      return res.json();
    })
    .then((data: PowerPlant[]) => {
      cachedPlants = data;
      return data;
    });

  return fetchPromise;
}

interface UsePowerPlantsResult {
  plants: PowerPlant[];
  isLoading: boolean;
  error: string | null;
}

/**
 * React hook to load all power plants client-side.
 * Data is cached in memory after first fetch.
 */
export function usePowerPlants(): UsePowerPlantsResult {
  const [plants, setPlants] = useState<PowerPlant[]>(cachedPlants ?? []);
  const [isLoading, setIsLoading] = useState(!cachedPlants);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedPlants) {
      setPlants(cachedPlants);
      setIsLoading(false);
      return;
    }

    fetchPowerPlants()
      .then((data) => {
        setPlants(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  return { plants, isLoading, error };
}

/**
 * Hook to load a single power plant by slug.
 */
export function usePowerPlant(slug: string): { plant: PowerPlant | null; isLoading: boolean } {
  const { plants, isLoading } = usePowerPlants();
  const plant = plants.find((p) => p.slug === slug) ?? null;
  return { plant, isLoading };
}

// Synchronous helpers for use after data is loaded
export function filterByUtility(plants: PowerPlant[], utilityId: string): PowerPlant[] {
  return plants.filter((p) => p.utilityId === utilityId);
}

export function filterByBA(plants: PowerPlant[], baId: string): PowerPlant[] {
  return plants.filter((p) => p.balancingAuthorityId === baId);
}

export function filterByState(plants: PowerPlant[], state: string): PowerPlant[] {
  return plants.filter((p) => p.state === state);
}

export function filterByFuelCategory(plants: PowerPlant[], fuelCategory: string): PowerPlant[] {
  return plants.filter((p) => p.fuelCategory === fuelCategory);
}
