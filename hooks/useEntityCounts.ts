"use client";

import { useEffect, useState } from "react";

export interface EntityCounts {
  utilities: number | null;
  isos: number | null;
  rtos: number | null;
  balancingAuthorities: number | null;
  powerPlants: number | null;
  transmissionLines: number | null;
  evStations: number | null;
  pricingNodes: number | null;
  programs: number | null;
  territories: number | null;
}

export const COUNT_ENDPOINTS: { key: keyof EntityCounts; path: string }[] = [
  { key: "utilities", path: "/api/v1/utilities?limit=1" },
  { key: "isos", path: "/api/v1/isos?limit=1" },
  { key: "rtos", path: "/api/v1/rtos?limit=1" },
  { key: "balancingAuthorities", path: "/api/v1/balancing-authorities?limit=1" },
  { key: "powerPlants", path: "/api/v1/power-plants?limit=1" },
  { key: "transmissionLines", path: "/api/v1/transmission-lines?limit=1" },
  { key: "evStations", path: "/api/v1/ev-stations?limit=1" },
  { key: "pricingNodes", path: "/api/v1/pricing-nodes?limit=1" },
  { key: "programs", path: "/api/v1/programs?limit=1" },
  { key: "territories", path: "/api/v1/territories?limit=1" },
];

export function useEntityCounts(): EntityCounts {
  const [counts, setCounts] = useState<EntityCounts>({
    utilities: null,
    isos: null,
    rtos: null,
    balancingAuthorities: null,
    powerPlants: null,
    transmissionLines: null,
    evStations: null,
    pricingNodes: null,
    programs: null,
    territories: null,
  });

  useEffect(() => {
    for (const { key, path } of COUNT_ENDPOINTS) {
      fetch(path)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const total = json?.pagination?.total ?? null;
          if (total !== null) {
            setCounts((prev) => ({ ...prev, [key]: total }));
          }
        })
        .catch(() => {});
    }
  }, []);

  return counts;
}

export function formatCount(n: number | null): string {
  return n !== null ? n.toLocaleString() : "\u2014";
}
