import type { Metadata } from "next";
import type { PowerPlant } from "@/types/entities";
import { PowerPlantsClient } from "./PowerPlantsClient";

export const metadata: Metadata = {
  title: "Power Plants | CommonGrid",
  description: "Browse all power plants in the United States with filtering and search.",
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    sort?: string;
    order?: string;
    fuelCategory?: string;
    status?: string;
    state?: string;
    cursor?: string;
  }>;
}

interface ApiResponse {
  status: string;
  data: PowerPlant[];
  total: number;
  cursor: string | null;
  limit: number;
}

export default async function PowerPlantsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Build API query params
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.set("search", params.search);
  if (params.sort) queryParams.set("sort", params.sort);
  if (params.order) queryParams.set("order", params.order);
  if (params.fuelCategory) queryParams.set("fuelCategory", params.fuelCategory);
  if (params.status) queryParams.set("status", params.status);
  if (params.state) queryParams.set("state", params.state);
  if (params.cursor) queryParams.set("cursor", params.cursor);
  queryParams.set("limit", "50");

  // Fetch initial data from API
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/v1/power-plants?${queryParams.toString()}`, {
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch power plants: ${res.status}`);
  }

  const json = (await res.json()) as ApiResponse;

  // Fetch all states for filter (separate lightweight call)
  const statesRes = await fetch(`${baseUrl}/api/v1/power-plants?fields=state&limit=200`, {
    next: { revalidate: 3600 }, // Cache states for 1 hour
  });

  const statesJson = (await statesRes.json()) as ApiResponse;
  const states = Array.from(new Set(statesJson.data.map((p) => p.state))).sort();

  return (
    <PowerPlantsClient
      initialData={json.data}
      initialTotal={json.total}
      initialCursor={json.cursor}
      states={states}
    />
  );
}
