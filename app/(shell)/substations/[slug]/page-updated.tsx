/**
 * Substation detail page: /substations/[slug]
 *
 * Display detailed information about a single substation including
 * map, ownership, voltage info, connected transmission lines, etc.
 *
 * Implementation note: this server component calls `loadSubstationBySlug`
 * directly instead of doing an internal HTTP fetch to our own API route.
 * The HTTP round-trip had been failing on Vercel (Clerk middleware / edge
 * bot protection / fetch-cache edge cases) causing legitimate slugs to
 * render as 404 even though `/api/v1/substations/[slug]` returned 200.
 * A direct function call avoids the round-trip entirely and is the
 * pattern used by other entity detail pages.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";

import { loadSubstationBySlug } from "@/lib/data/substations-api";
import type { SubstationRecord } from "@/types/substations";

interface Props {
  params: Promise<{ slug: string }>;
}

async function SubstationDetailContent({ slug }: { slug: string }) {
  let substation: SubstationRecord | null;
  try {
    substation = await loadSubstationBySlug(slug);
  } catch (error) {
    console.error("Error loading substation detail:", error);
    return notFound();
  }

  if (!substation) {
    return notFound();
  }

  // Format voltage display
  const voltageDisplay = [substation.minVoltageKv, substation.maxVoltageKv]
    .filter((v): v is number => typeof v === "number")
    .map((v) => `${v}kV`)
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
              backgroundColor: "var(--color-background-subtle)",
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
              backgroundColor: "var(--color-background-subtle)",
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
                backgroundColor: "var(--color-background-subtle)",
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
        <div style={{ border: "1px solid var(--color-border-default)", borderRadius: "8px", padding: "16px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: "500", marginBottom: "12px" }}>
            Location
          </h2>
          <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>State</div>
              <div>{substation.state}</div>
            </div>
            {substation.county && (
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>County</div>
                <div>{substation.county}</div>
              </div>
            )}
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>Coordinates</div>
              <div style={{ fontSize: "12px", fontFamily: "monospace" }}>
                {substation.latitude.toFixed(4)}, {substation.longitude.toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        {/* Voltage card */}
        <div style={{ border: "1px solid var(--color-border-default)", borderRadius: "8px", padding: "16px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: "500", marginBottom: "12px" }}>
            Voltage
          </h2>
          <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
            {voltageDisplay && (
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>Range</div>
                <div>{voltageDisplay}</div>
              </div>
            )}
            {substation.voltageBand && (
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>Classification</div>
                <div style={{ textTransform: "capitalize" }}>{substation.voltageBand}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ownership card */}
      {substation.ownerName && (
        <div style={{ border: "1px solid var(--color-border-default)", borderRadius: "8px", padding: "16px", marginBottom: "32px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: "500", marginBottom: "12px" }}>
            Ownership & Operations
          </h2>
          <div style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>Owner</div>
              <div>{substation.ownerName}</div>
            </div>
          </div>
        </div>
      )}

      {/* Source information */}
      <div
        style={{ fontSize: "11px", color: "var(--color-text-caption)", padding: "16px", backgroundColor: "var(--color-background-subtle)", borderRadius: "4px" }}
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
    const substation = await loadSubstationBySlug(slug);
    if (substation) {
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
