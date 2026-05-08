/**
 * Substation detail page: /substations/[slug]
 *
 * Display detailed information about a single substation including
 * map, ownership, voltage info, connected transmission lines, etc.
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Build an absolute URL for server-side fetches against our own API.
 *
 * Vercel's default `VERCEL_URL` (the deployment-specific hostname) has bot
 * protection enabled by default and is NOT the public alias (`commongrid.info`),
 * so fetching it from within a server component can redirect / auth-fail.
 *
 * Instead, derive the origin from the incoming request headers (set by Vercel's
 * edge network). Fall back to `NEXT_PUBLIC_API_URL` (explicit override) or
 * localhost for local dev.
 */
async function buildInternalApiUrl(path: string): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return new URL(path, explicit).toString();
  try {
    const hdrs = await headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    if (host) return new URL(path, `${proto}://${host}`).toString();
  } catch {
    // `headers()` is only callable in request-scoped contexts; fall through.
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) return new URL(path, `https://${vercel}`).toString();
  return new URL(path, "http://localhost:3000").toString();
}

async function SubstationDetailContent({ slug }: { slug: string }) {
  try {
    const url = await buildInternalApiUrl(`/api/v1/substations/${slug}`);
    const response = await fetch(url, { next: { revalidate: 86400 } });

    if (!response.ok) {
      return notFound();
    }

    const result = await response.json();
    const substation = result.data;

    // Format voltage display
    const voltageDisplay = [substation.minVoltageKv, substation.maxVoltageKv]
      .filter(Boolean)
      .map((v: number) => `${v}kV`)
      .join(" - ");

    // Attribution text for ODbL sources
    const attributionText =
      substation.source === "osm"
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
              {substation.voltageBand || "unknown"}
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
              {substation.voltageBand && (
                <div>
                  <div style={{ color: "#666", fontSize: "12px" }}>Classification</div>
                  <div style={{ textTransform: "capitalize" }}>{substation.voltageBand}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ownership card */}
        {substation.ownerName && (
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", marginBottom: "32px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", textTransform: "uppercase" }}>
              Ownership & Operations
            </h2>
            <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
              <div>
                <div style={{ color: "#666", fontSize: "12px" }}>Owner</div>
                <div>{substation.ownerName}</div>
              </div>
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
    const url = await buildInternalApiUrl(`/api/v1/substations/${slug}`);
    const response = await fetch(url);
    if (response.ok) {
      const result = await response.json();
      const substation = result.data;
      return {
        title: `${substation.name} | Substations | CommonGrid`,
        description: `${substation.name} substation in ${substation.state}. ${substation.voltageBand || "Voltage"} class, operated by ${substation.ownerName || "Unknown operator"}.`,
      };
    }
  } catch {
    // Fall back to default
  }

  return {
    title: "Substation | CommonGrid",
  };
}
