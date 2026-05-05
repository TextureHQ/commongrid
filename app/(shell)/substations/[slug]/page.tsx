/**
 * Substation detail page: /substations/[slug]
 *
 * Display detailed information about a single substation including
 * map, ownership, voltage info, connected transmission lines, etc.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";

interface Props {
  params: Promise<{ slug: string }>;
}

async function SubstationDetailContent({ slug }: { slug: string }) {
  try {
    const url = new URL(`/api/v1/substations/${slug}`, process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");
    const response = await fetch(url.toString(), { next: { revalidate: 86400 } });

    if (!response.ok) {
      return notFound();
    }

    const result = await response.json();
    const substation = result.data;

    // Format voltage display
    const voltageDisplay = [substation.minVoltageKv, substation.maxVoltageKv]
      .filter(Boolean)
      .map((v) => `${v}kV`)
      .join(" - ");

    // Attribution text for ODbL sources
    const attributionText =
      substation.source === "OSM"
        ? "© OpenStreetMap contributors. Licensed under ODbL 1.0"
        : substation.source === "hybrid"
          ? "Data from EIA and OpenStreetMap contributors. OSM portions licensed under ODbL 1.0"
          : "Data from EIA";

    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "8px" }}>{substation.name}</h1>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-block",
                backgroundColor: "#f0f0f0",
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              {substation.voltageClass || "unknown"}
            </span>
            <span
              style={{
                display: "inline-block",
                backgroundColor: "#f0f0f0",
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              {substation.status || "unknown"}
            </span>
            {substation.source && (
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: "#f0f0f0",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                Source: {substation.source}
              </span>
            )}
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
          {/* Location card */}
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", textTransform: "uppercase" }}>
              Location
            </h2>
            <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
              <div>
                <div style={{ color: "#666", fontSize: "12px" }}>State</div>
                <div>{substation.state}</div>
              </div>
              {substation.county && (
                <div>
                  <div style={{ color: "#666", fontSize: "12px" }}>County</div>
                  <div>{substation.county}</div>
                </div>
              )}
              <div>
                <div style={{ color: "#666", fontSize: "12px" }}>Coordinates</div>
                <div style={{ fontSize: "12px", fontFamily: "monospace" }}>
                  {substation.latitude.toFixed(4)}, {substation.longitude.toFixed(4)}
                </div>
              </div>
            </div>
          </div>

          {/* Voltage card */}
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", textTransform: "uppercase" }}>
              Voltage
            </h2>
            <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
              {voltageDisplay && (
                <div>
                  <div style={{ color: "#666", fontSize: "12px" }}>Range</div>
                  <div>{voltageDisplay}</div>
                </div>
              )}
              {substation.voltageClass && (
                <div>
                  <div style={{ color: "#666", fontSize: "12px" }}>Classification</div>
                  <div style={{ textTransform: "capitalize" }}>{substation.voltageClass}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ownership card */}
        {(substation.owner || substation.operator) && (
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", marginBottom: "32px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", textTransform: "uppercase" }}>
              Ownership & Operations
            </h2>
            <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
              {substation.owner && (
                <div>
                  <div style={{ color: "#666", fontSize: "12px" }}>Owner</div>
                  <div>{substation.owner}</div>
                </div>
              )}
              {substation.operator && (
                <div>
                  <div style={{ color: "#666", fontSize: "12px" }}>Operator</div>
                  <div>{substation.operator}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connected elements */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "32px" }}>
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "700" }}>{substation.transmissionLineCount || 0}</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Transmission Lines</div>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "700" }}>{substation.powerPlantCount || 0}</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Nearby Power Plants</div>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "700" }}>{substation.pricingNodeCount || 0}</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Pricing Nodes</div>
          </div>
        </div>

        {/* Grid context */}
        {(substation.balancingAuthorityId || substation.isoId || substation.nercRegion) && (
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", marginBottom: "32px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", textTransform: "uppercase" }}>
              Grid Context
            </h2>
            <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
              {substation.nercRegion && (
                <div>
                  <div style={{ color: "#666", fontSize: "12px" }}>NERC Region</div>
                  <div>{substation.nercRegion}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Source information */}
        <div
          style={{ fontSize: "11px", color: "#999", padding: "16px", backgroundColor: "#f9f9f9", borderRadius: "4px" }}
        >
          <strong>Data attribution:</strong> {attributionText}
          {substation.sourceUrl && (
            <>
              {" "}
              <a href={substation.sourceUrl} target="_blank" rel="noopener noreferrer">
                View source
              </a>
            </>
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error loading substation detail:", error);
    return notFound();
  }
}

export default function SubstationDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<div style={{ padding: "24px" }}>Loading...</div>}>
      <SubstationDetailContentWrapper params={params} />
    </Suspense>
  );
}

async function SubstationDetailContentWrapper({ params }: Props) {
  const { slug } = await params;
  return <SubstationDetailContent slug={slug} />;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const url = new URL(`/api/v1/substations/${slug}`, process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");
    const response = await fetch(url.toString());
    if (response.ok) {
      const result = await response.json();
      const substation = result.data;
      return {
        title: `${substation.name} | Substations | CommonGrid`,
        description: `${substation.name} substation in ${substation.state}. ${substation.voltageClass || "Voltage"} class, operated by ${substation.owner || "Unknown operator"}.`,
      };
    }
  } catch {
    // Fall back to default
  }

  return {
    title: "Substation | CommonGrid",
  };
}
