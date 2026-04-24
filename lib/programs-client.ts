"use client";

import { useEffect, useState } from "react";

export interface ClientProgram {
  id: string;
  slug: string;
  name: string;
  organizations: { entityId?: string; role?: string }[];
  assetTypes: string[];
  marketSegments: string[];
  gridServices: string[];
  status: string;
  programWebsite?: string | null;
}

interface UseProgramsResult {
  programs: ClientProgram[];
  isLoading: boolean;
}

let cachedPrograms: ClientProgram[] | null = null;
let fetchPromise: Promise<ClientProgram[]> | null = null;

function fetchPrograms(): Promise<ClientProgram[]> {
  if (cachedPrograms) return Promise.resolve(cachedPrograms);
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch("/data/programs.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((data: ClientProgram[]) => {
      cachedPrograms = data;
      return data;
    })
    .catch(() => []);
  return fetchPromise;
}

export function usePrograms(): UseProgramsResult {
  const [programs, setPrograms] = useState<ClientProgram[]>(cachedPrograms ?? []);
  const [isLoading, setIsLoading] = useState(!cachedPrograms);

  useEffect(() => {
    if (cachedPrograms) return;
    fetchPrograms().then((data) => {
      setPrograms(data);
      setIsLoading(false);
    });
  }, []);

  return { programs, isLoading };
}

/** Filter programs that belong to a given utility slug */
export function filterProgramsByUtility(programs: ClientProgram[], utilitySlug: string): ClientProgram[] {
  return programs.filter((p) => p.organizations.some((o) => o.entityId === utilitySlug));
}
