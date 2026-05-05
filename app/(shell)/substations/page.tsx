/**
 * Substations list page: /substations
 *
 * Browse all US electric substations with filtering and search.
 */

import { redirect } from "next/navigation";
import { Suspense } from "react";

interface SearchParams {
  state?: string;
  voltageClass?: string;
  status?: string;
  search?: string;
  page?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

async function SubstationsListContent({ searchParams }: Props) {
  const params = await searchParams;
  const state = params.state || "";
  const voltageClass = params.voltageClass || "";
  const status = params.status || "";
  const search = params.search || "";
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const url = new URL("/api/v1/substations", process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    if (state) url.searchParams.set("state", state);
    if (voltageClass) url.searchParams.set("voltageClass", voltageClass);
    if (status) url.searchParams.set("status", status);
    if (search) url.searchParams.set("search", search);

    const response = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("Failed to fetch substations");

    const result = await response.json();
    const { data: substations, pagination } = result;

    return (
      <div style={{ padding: "24px" }}>
        <h1>US Electric Substations</h1>
        <p>{pagination.total} substations found</p>

        <div style={{ marginBottom: "24px" }}>
          {/* Filter UI would go here */}
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          {substations.map((substation: any) => (
            <a key={substation.id} href={`/substations/${substation.slug}`} style={{ textDecoration: "none" }}>
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "16px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                  (e.currentTarget as HTMLElement).style.borderColor = "#999";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  (e.currentTarget as HTMLElement).style.borderColor = "#ddd";
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: "600" }}>{substation.name}</div>
                <div style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
                  {substation.state} {substation.owner && `• ${substation.owner}`}
                </div>
                <div style={{ fontSize: "12px", color: "#999", marginTop: "8px" }}>
                  {substation.maxVoltageKv}kV • {substation.voltageClass} • {substation.status}
                </div>
              </div>
            </a>
          ))}
        </div>

        {pagination.hasMore && (
          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <a href={`/substations?page=${page + 1}`}>Load more</a>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Error loading substations:", error);
    return <div>Failed to load substations</div>;
  }
}

export default function SubstationsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<div style={{ padding: "24px" }}>Loading...</div>}>
      <SubstationsListContent searchParams={searchParams} />
    </Suspense>
  );
}

export const metadata = {
  title: "US Electric Substations | CommonGrid",
  description: "Browse and explore US electric substations from EIA and OpenStreetMap data",
};
