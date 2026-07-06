/**
 * Transmission Line detail page: /transmission-lines/[id]
 *
 * Server component — calls `loadTransmissionLineById` directly from the data layer.
 * Returns 404 via `notFound()` if the line doesn't exist.
 */

import { notFound } from "next/navigation";
import { Suspense } from "react";

import { loadTransmissionLineById } from "@/lib/data/transmission-lines";
import type { TransmissionLine, VoltageClass } from "@/types/transmission-lines";
import { VoltageClassLabel } from "@/types/transmission-lines";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function voltageDisplay(voltage: number | null): string {
  if (voltage == null || voltage <= 0) return "—";
  return `${voltage} kV`;
}

function voltageClassShort(vc: VoltageClass): string {
  switch (vc) {
    case "extra-high":
      return "345kV+";
    case "high":
      return "230–344kV";
    case "medium":
      return "115–229kV";
    case "sub-trans":
      return "69–114kV";
    default:
      return "Unknown";
  }
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("in service") && !s.includes("not")) return "bg-green-100 text-green-800";
  if (s.includes("not in service")) return "bg-red-100 text-red-800";
  if (s.includes("construction")) return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-700";
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ id: string }>;
}

async function TransmissionLineDetailContent({ id }: { id: string }) {
  const line: TransmissionLine | null = await loadTransmissionLineById(id);

  if (!line) {
    return notFound();
  }

  const lengthStr = line.lengthMiles > 0 ? `${line.lengthMiles.toFixed(1)} mi` : "—";

  return (
    <div className="max-w-[900px] mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[32px] font-bold mb-2">Transmission Line {line.id}</h1>
        <div className="flex gap-3 flex-wrap">
          <span className="inline-block px-3 py-1.5 rounded text-xs bg-background-subtle">
            {voltageClassShort(line.voltageClass)}
          </span>
          <span className={`inline-block px-3 py-1.5 rounded text-xs ${statusBadgeClass(line.status)}`}>
            {line.status || "Unknown"}
          </span>
          <span className="inline-block px-3 py-1.5 rounded text-xs bg-background-subtle">
            {line.type || "Unknown"}
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Voltage card */}
        <div className="rounded-lg p-4 border border-border-default">
          <h2 className="text-sm font-medium mb-3">Voltage</h2>
          <div className="grid gap-2 text-sm">
            <div>
              <div className="text-xs text-text-muted">Operating Voltage</div>
              <div>{voltageDisplay(line.voltage)}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Classification</div>
              <div>{VoltageClassLabel[line.voltageClass]}</div>
            </div>
            {line.voltClass && (
              <div>
                <div className="text-xs text-text-muted">Volt Class Code</div>
                <div>{line.voltClass}</div>
              </div>
            )}
          </div>
        </div>

        {/* Route card */}
        <div className="rounded-lg p-4 border border-border-default">
          <h2 className="text-sm font-medium mb-3">Route</h2>
          <div className="grid gap-2 text-sm">
            <div>
              <div className="text-xs text-text-muted">Substation 1</div>
              <div>{line.sub1 || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Substation 2</div>
              <div>{line.sub2 || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Length</div>
              <div>{lengthStr}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ownership card */}
      <div className="rounded-lg p-4 border border-border-default mb-8">
        <h2 className="text-sm font-medium mb-3">Ownership &amp; Classification</h2>
        <div className="grid gap-2 text-sm">
          <div>
            <div className="text-xs text-text-muted">Owner</div>
            <div>{line.owner || "Unknown"}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted">NAICS Code</div>
            <div style={{ fontSize: "12px", fontFamily: "monospace" }}>{line.naicsCode || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Source</div>
            <div>{line.source || "—"}</div>
          </div>
        </div>
      </div>

      {/* Object ID reference */}
      <div className="text-xs text-text-caption pb-4">HIFLD Object ID: {line.objectId}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export
// ---------------------------------------------------------------------------

export default function TransmissionLineDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<div style={{ padding: "24px" }}>Loading...</div>}>
      <TransmissionLineDetailContentWrapper params={params} />
    </Suspense>
  );
}

async function TransmissionLineDetailContentWrapper({ params }: Props) {
  const { id } = await params;
  return <TransmissionLineDetailContent id={id} />;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const line = await loadTransmissionLineById(id);
    if (line) {
      return {
        title: `Transmission Line ${line.id} | CommonGrid`,
        description: `${line.owner} transmission line (${voltageClassShort(line.voltageClass)}), ${line.lengthMiles > 0 ? `${line.lengthMiles.toFixed(1)} miles` : "length unknown"} connecting ${line.sub1 || "unknown"} to ${line.sub2 || "unknown"}.`,
      };
    }
  } catch {
    // Fall back to default
  }

  return {
    title: "Transmission Line | CommonGrid",
  };
}
