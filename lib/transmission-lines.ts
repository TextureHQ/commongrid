"use client";

import { useState, useEffect } from "react";
import type { TransmissionLine, VoltageClass } from "@/types/transmission-lines";

/**
 * Transmission line metadata is loaded via fetch (not static import) to avoid
 * bundling large JSON into Next.js pre-rendered pages.
 *
 * The JSON is served from /data/transmission-lines.json (copied to public/
 * at build time). The browser caches it after first load.
 */

let cachedLines: TransmissionLine[] | null = null;
let fetchPromise: Promise<TransmissionLine[]> | null = null;

async function fetchTransmissionLines(): Promise<TransmissionLine[]> {
  if (cachedLines) return cachedLines;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/data/transmission-lines.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load transmission lines: ${res.status}`);
      return res.json();
    })
    .then((data: TransmissionLine[]) => {
      cachedLines = data;
      return data;
    });

  return fetchPromise;
}

interface UseTransmissionLinesResult {
  lines: TransmissionLine[];
  isLoading: boolean;
  error: string | null;
}

/**
 * React hook to load all transmission lines client-side.
 * Data is cached in memory after first fetch.
 */
export function useTransmissionLines(): UseTransmissionLinesResult {
  const [lines, setLines] = useState<TransmissionLine[]>(cachedLines ?? []);
  const [isLoading, setIsLoading] = useState(!cachedLines);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedLines) {
      setLines(cachedLines);
      setIsLoading(false);
      return;
    }

    fetchTransmissionLines()
      .then((data) => {
        setLines(data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  return { lines, isLoading, error };
}

/**
 * Classify a voltage value (kV) into a VoltageClass.
 */
export function classifyVoltage(voltage: number | null): VoltageClass {
  if (voltage == null || voltage <= 0) return "unknown";
  if (voltage >= 345) return "extra-high";
  if (voltage >= 230) return "high";
  if (voltage >= 115) return "medium";
  if (voltage >= 69) return "sub-trans";
  return "unknown";
}

/**
 * Human-readable voltage label for display.
 */
export function getVoltageLabel(voltage: number | null): string {
  if (voltage == null || voltage <= 0) return "Unknown";
  return `${voltage} kV`;
}

export function filterByVoltageClass(
  lines: TransmissionLine[],
  voltageClass: VoltageClass | "all",
): TransmissionLine[] {
  if (voltageClass === "all") return lines;
  return lines.filter((l) => l.voltageClass === voltageClass);
}

export function filterByStatus(
  lines: TransmissionLine[],
  status: string,
): TransmissionLine[] {
  if (status === "all") return lines;
  return lines.filter((l) => l.status.toLowerCase().includes(status.toLowerCase()));
}
