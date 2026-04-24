"use client";

import { useEffect, useState } from "react";
import type { TransmissionLine } from "@/types/transmission-lines";

interface UseTransmissionLinesResult {
  lines: TransmissionLine[];
  isLoading: boolean;
}

let cachedLines: TransmissionLine[] | null = null;
let fetchPromise: Promise<TransmissionLine[]> | null = null;

function fetchLines(): Promise<TransmissionLine[]> {
  if (cachedLines) return Promise.resolve(cachedLines);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/data/transmission-lines.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: TransmissionLine[]) => {
      cachedLines = data;
      return data;
    })
    .catch(() => []);
  return fetchPromise;
}

export function useTransmissionLines(): UseTransmissionLinesResult {
  const [lines, setLines] = useState<TransmissionLine[]>(cachedLines ?? []);
  const [isLoading, setIsLoading] = useState(!cachedLines);

  useEffect(() => {
    if (cachedLines) return;
    fetchLines().then((data) => {
      setLines(data);
      setIsLoading(false);
    });
  }, []);

  return { lines, isLoading };
}

/** Filter transmission lines owned by a utility (fuzzy match on owner name) */
export function filterLinesByOwner(lines: TransmissionLine[], utilityName: string): TransmissionLine[] {
  const norm = utilityName.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  return lines.filter((l) => {
    if (!l.owner || l.owner === "NOT AVAILABLE") return false;
    const ownerNorm = l.owner.toUpperCase().replace(/[^A-Z0-9 ]/g, "");
    return ownerNorm.includes(norm) || norm.includes(ownerNorm);
  });
}
