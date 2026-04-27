"use client";

/**
 * MapTooltip — Rich tooltip components for the explore map.
 *
 * Each entity type gets a structured tooltip matching Nick's design:
 * - Kicker label (type, mono uppercase, accent color)
 * - Entity name (bold)
 * - 2-column stat grid with mono labels
 * - "View details →" CTA
 *
 * These render inside the Edges InteractiveMap tooltip container.
 */

import type { ReactNode } from "react";

/* ── Shared styles ─────────────────────────────────────────────────────────── */

const FONTS = {
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'Fira Code', ui-monospace, 'SF Mono', Menlo, monospace",
  brand: "'Rethink Sans', 'Helvetica Neue', Arial, system-ui, sans-serif",
};

const COLORS = {
  ink: "#111111",
  ink2: "#2c2a26",
  muted: "#6b6155",
  subtle: "#857b6b",
  faint: "#a89f90",
  rule: "#e5dfd3",
  accent: "#4a9a8a",
  card: "#ffffff",
};

const styles = {
  container: {
    fontFamily: FONTS.sans,
    WebkitFontSmoothing: "antialiased" as const,
    minWidth: 220,
    maxWidth: 280,
    border: `1px solid ${COLORS.rule}`,
    borderRadius: 8,
    boxShadow: "0 2px 8px rgba(0,0,0,0.10), 0 0 1px rgba(0,0,0,0.08)",
    padding: 14,
  },
  kicker: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: 600 as const,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: COLORS.accent,
    marginBottom: 6,
    lineHeight: 1,
  },
  name: {
    fontFamily: FONTS.brand,
    fontSize: 16,
    fontWeight: 600 as const,
    color: COLORS.ink,
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    background: COLORS.rule,
    margin: "0 0 10px",
  },
  statGrid: {
    display: "grid" as const,
    gridTemplateColumns: "1fr 1fr",
    gap: "8px 16px",
    marginBottom: 12,
  },
  statValue: {
    fontFamily: FONTS.brand,
    fontSize: 14,
    fontWeight: 600 as const,
    color: COLORS.ink2,
    lineHeight: 1.2,
  },
  statLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    fontWeight: 500 as const,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: COLORS.faint,
    lineHeight: 1,
    marginTop: 2,
  },
  cta: {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    padding: "8px 0",
    border: `1px solid ${COLORS.rule}`,
    borderRadius: 6,
    marginTop: 12,
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: 500 as const,
    color: COLORS.muted,
    letterSpacing: "-0.01em",
    cursor: "pointer" as const,
  },
};

/* ── Stat cell ─────────────────────────────────────────────────────────────── */

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

/* ── Formatters ────────────────────────────────────────────────────────────── */

function fmtCount(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return n.toLocaleString();
}

function fmtCapacity(mw: number | null | undefined): string {
  if (mw == null || mw === 0) return "—";
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}

/* ── Territory (utility) tooltip ───────────────────────────────────────────── */

interface TerritoryProps {
  name: string;
  segment: string;
  state?: string | null;
  customerCount?: number | null;
  baCode?: string | null;
}

const segmentLabels: Record<string, string> = {
  // Full enum values from tiles
  INVESTOR_OWNED_UTILITY: "Investor-Owned Utility",
  DISTRIBUTION_COOPERATIVE: "Distribution Co-op",
  MUNICIPAL_UTILITY: "Municipal Utility",
  COMMUNITY_CHOICE_AGGREGATOR: "Community Choice Aggregation",
  GENERATION_AND_TRANSMISSION: "Generation & Transmission",
  POLITICAL_SUBDIVISION: "Political Subdivision",
  TRANSMISSION_OPERATOR: "Transmission Operator",
  // Short aliases (legacy / fallback)
  IOU: "Investor-Owned Utility",
  "Co-op": "Distribution Co-op",
  Muni: "Municipal Utility",
  Federal: "Federal Power Agency",
  Political: "Political Subdivision",
  Retail: "Retail Power Marketer",
  Wholesale: "Wholesale Power Marketer",
  "Behind-the-meter": "Behind the Meter",
  CCA: "Community Choice Aggregation",
};

export function TerritoryTooltip({ name, segment, state, customerCount, baCode }: TerritoryProps) {
  const segmentLabel = segmentLabels[segment] ?? segment;
  const displaySegment =
    segment === "DISTRIBUTION_COOPERATIVE"
      ? "Co-op"
      : segment === "INVESTOR_OWNED_UTILITY"
        ? "IOU"
        : segment === "MUNICIPAL_UTILITY"
          ? "Muni"
          : segment === "COMMUNITY_CHOICE_AGGREGATOR"
            ? "CCA"
            : segment;
  return (
    <div style={styles.container}>
      <div style={styles.kicker}>{segmentLabel}</div>
      <div style={styles.name}>{name}</div>
      <div style={styles.divider} />
      <div style={styles.statGrid}>
        <Stat value={fmtCount(customerCount)} label="Customers" />
        <Stat value={baCode ?? "—"} label="ISO / RTO" />
        <Stat value={state ?? "—"} label="State" />
        <Stat value={displaySegment} label="Segment" />
      </div>
      <div style={styles.cta}>View details →</div>
    </div>
  );
}

/* ── Grid operator tooltip ─────────────────────────────────────────────────── */

interface GridOperatorProps {
  operatorName: string;
  operatorType: string;
}

export function GridOperatorTooltip({ operatorName, operatorType }: GridOperatorProps) {
  return (
    <div style={styles.container}>
      <div style={styles.kicker}>{operatorType}</div>
      <div style={styles.name}>{operatorName}</div>
      <div style={styles.cta}>View details →</div>
    </div>
  );
}

/* ── Transmission line tooltip ─────────────────────────────────────────────── */

interface TransmissionProps {
  owner: string;
  voltage: number | null;
  status?: string | null;
}

export function TransmissionTooltip({ owner, voltage, status }: TransmissionProps) {
  return (
    <div style={styles.container}>
      <div style={styles.kicker}>Transmission Line</div>
      <div style={styles.name}>{owner || "Unknown Owner"}</div>
      <div style={styles.divider} />
      <div style={styles.statGrid}>
        <Stat value={voltage != null ? `${voltage} kV` : "—"} label="Voltage" />
        <Stat value={status ?? "Active"} label="Status" />
      </div>
    </div>
  );
}

/* ── EV charging tooltip ───────────────────────────────────────────────────── */

interface EVChargingProps {
  name: string;
  network: string;
  dcFastCount: number;
  level2Count: number;
  level1Count: number;
  accessCode: string;
}

const accessLabels: Record<string, string> = {
  public: "Public",
  private: "Private",
};

export function EVChargingTooltip({
  name,
  network,
  dcFastCount,
  level2Count,
  level1Count,
  accessCode,
}: EVChargingProps) {
  const totalPorts = dcFastCount + level2Count + level1Count;
  return (
    <div style={styles.container}>
      <div style={styles.kicker}>{network || "Non-Networked"}</div>
      <div style={styles.name}>{name}</div>
      <div style={styles.divider} />
      <div style={styles.statGrid}>
        <Stat value={totalPorts} label="Total Ports" />
        <Stat value={accessLabels[accessCode] ?? accessCode} label="Access" />
        {dcFastCount > 0 && <Stat value={dcFastCount} label="DC Fast" />}
        {level2Count > 0 && <Stat value={level2Count} label="Level 2" />}
      </div>
      <div style={styles.cta}>View details →</div>
    </div>
  );
}

/* ── Pricing node tooltip ──────────────────────────────────────────────────── */

interface PricingNodeProps {
  name: string;
  iso: string;
  nodeType: string;
  zone?: string | null;
}

const nodeTypeLabels: Record<string, string> = {
  gen: "Generation Node",
  load: "Load Node",
  hub: "Trading Hub",
  zone: "Load Zone",
  sublap: "Sub-LAP",
  lap: "LAP",
  interface: "Interface",
  bus: "Bus",
};

export function PricingNodeTooltip({ name, iso, nodeType, zone }: PricingNodeProps) {
  return (
    <div style={styles.container}>
      <div style={styles.kicker}>{nodeTypeLabels[nodeType] ?? nodeType}</div>
      <div style={styles.name}>{name}</div>
      <div style={styles.divider} />
      <div style={styles.statGrid}>
        <Stat value={iso} label="ISO / RTO" />
        {zone && <Stat value={zone} label="Zone" />}
      </div>
      <div style={styles.cta}>View details →</div>
    </div>
  );
}

/* ── Program territory tooltip ─────────────────────────────────────────────── */

interface ProgramTerritoryProps {
  programName: string;
  programStatus: string;
}

const programStatusLabels: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  FULL: "Full",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};

const programStatusColors: Record<string, string> = {
  ACTIVE: "#65a30d",
  PAUSED: "#d97706",
  FULL: "#6b7280",
  DRAFT: "#9ca3af",
  ARCHIVED: "#9ca3af",
};

export function ProgramTerritoryTooltip({ programName, programStatus }: ProgramTerritoryProps) {
  const statusLabel = programStatusLabels[programStatus] ?? programStatus;
  const statusColor = programStatusColors[programStatus] ?? COLORS.muted;
  return (
    <div style={styles.container}>
      <div style={styles.kicker}>Program</div>
      <div style={styles.name}>{programName}</div>
      <div style={styles.divider} />
      <div style={styles.statGrid}>
        <Stat value={<span style={{ color: statusColor }}>{statusLabel}</span>} label="Status" />
      </div>
      <div style={styles.cta}>View details →</div>
    </div>
  );
}

/* ── Power plant tooltip ───────────────────────────────────────────────────── */

interface PowerPlantProps {
  name: string;
  fuelCategory: string;
  capacityMw: number;
  status: string;
}

const fuelLabels: Record<string, string> = {
  solar: "Solar",
  wind: "Wind",
  natural_gas: "Natural Gas",
  coal: "Coal",
  nuclear: "Nuclear",
  hydro: "Hydroelectric",
  petroleum: "Petroleum",
  biomass: "Biomass",
  geothermal: "Geothermal",
  storage: "Storage",
  other: "Other",
};

export function PowerPlantTooltip({ name, fuelCategory, capacityMw, status }: PowerPlantProps) {
  const fuelLabel = fuelLabels[fuelCategory] ?? fuelCategory;
  return (
    <div style={styles.container}>
      <div style={styles.kicker}>{fuelLabel} Plant</div>
      <div style={styles.name}>{name}</div>
      <div style={styles.divider} />
      <div style={styles.statGrid}>
        <Stat value={fmtCapacity(capacityMw)} label="Capacity" />
        <Stat value={fuelLabel} label="Fuel" />
        {status === "proposed" && <Stat value="Proposed" label="Status" />}
      </div>
      <div style={styles.cta}>View details →</div>
    </div>
  );
}
