"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./homepage.css";

// ---------------------------------------------------------------------------
// Fetch live counts from the API (each endpoint returns pagination.total)
// ---------------------------------------------------------------------------

interface EntityCounts {
  utilities: number | null;
  isos: number | null;
  rtos: number | null;
  balancingAuthorities: number | null;
  powerPlants: number | null;
  transmissionLines: number | null;
  evStations: number | null;
  pricingNodes: number | null;
  programs: number | null;
}

const COUNT_ENDPOINTS: { key: keyof EntityCounts; path: string }[] = [
  { key: "utilities", path: "/api/v1/utilities?limit=1" },
  { key: "isos", path: "/api/v1/isos?limit=1" },
  { key: "rtos", path: "/api/v1/rtos?limit=1" },
  { key: "balancingAuthorities", path: "/api/v1/balancing-authorities?limit=1" },
  { key: "powerPlants", path: "/api/v1/power-plants?limit=1" },
  { key: "transmissionLines", path: "/api/v1/transmission-lines?limit=1" },
  { key: "evStations", path: "/api/v1/ev-stations?limit=1" },
  { key: "pricingNodes", path: "/api/v1/pricing-nodes?limit=1" },
  { key: "programs", path: "/api/v1/programs?limit=1" },
];

function useEntityCounts(): EntityCounts {
  const [counts, setCounts] = useState<EntityCounts>({
    utilities: null,
    isos: null,
    rtos: null,
    balancingAuthorities: null,
    powerPlants: null,
    transmissionLines: null,
    evStations: null,
    pricingNodes: null,
    programs: null,
  });

  useEffect(() => {
    for (const { key, path } of COUNT_ENDPOINTS) {
      fetch(path)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const total = json?.pagination?.total ?? null;
          if (total !== null) {
            setCounts((prev) => ({ ...prev, [key]: total }));
          }
        })
        .catch(() => {});
    }
  }, []);

  return counts;
}

function formatCount(n: number | null): string {
  return n !== null ? n.toLocaleString() : "—";
}

const RATE_SCHEDULE_COUNT = "~12k";

const ENTITY_CARDS = [
  {
    num: "01",
    cat: "Operators",
    href: "/grid-operators",
    name: "Electric utilities",
    desc: "All U.S. utilities \u2014 IOUs, co-ops, munis, and federal power agencies. Filtered by state, segment, and ISO.",
    countKey: "utilities" as const,
    tags: ["EIA-861", "FERC"],
  },
  {
    num: "02",
    cat: "Markets",
    href: "/grid-operators",
    name: "ISOs, RTOs & balancing authorities",
    desc: "The entities that coordinate dispatch, markets, and reliability across every interconnection.",
    countKey: "gridOperators" as const,
    tags: ["NERC", "FERC-714"],
  },
  {
    num: "03",
    cat: "Programs",
    href: "/explore?view=programs",
    name: "Programs & incentives",
    desc: "Demand response, rebates, EV programs, VPP \u2014 queryable by asset type, segment, and territory.",
    countKey: "programs" as const,
    tags: ["Structured", "Citable"],
  },
  {
    num: "04",
    cat: "Tariffs",
    href: "/explore?view=rates",
    name: "Rates & tariffs",
    desc: "Residential and commercial rate structures \u2014 TOU windows, demand charges, standby, net metering.",
    count: RATE_SCHEDULE_COUNT,
    tags: ["OpenEI", "Filed"],
  },
  {
    num: "05",
    cat: "Generation",
    href: "/power-plants",
    name: "Power plants",
    desc: "Solar, wind, nuclear, gas, hydro \u2014 EIA Form 860 normalized and connected to utilities and territories.",
    countKey: "powerPlants" as const,
    tags: ["EIA-860", ">1 MW"],
  },
  {
    num: "06",
    cat: "Transmission",
    href: "/transmission-lines",
    name: "Transmission lines",
    desc: "High-voltage infrastructure from 69 kV to 765 kV. Spatially queryable, attributed to owners.",
    countKey: "transmissionLines" as const,
    tags: ["HIFLD", "Spatial"],
  },
  {
    num: "07",
    cat: "EV charging",
    href: "/ev-charging",
    name: "EV charging stations",
    desc: "Every public AC and DC station in the U.S. \u2014 networks, plug standards, and power levels.",
    countKey: "evStations" as const,
    tags: ["AFDC", "OCPI"],
  },
  {
    num: "08",
    cat: "Wholesale",
    href: "/pricing-nodes",
    name: "Pricing nodes",
    desc: "Wholesale market nodes \u2014 trading hubs, load zones, SUBLAPs, and generation pricing across 7 ISOs/RTOs.",
    countKey: "pricingNodes" as const,
    tags: ["LMP", "DA / RT"],
  },
];

const LEDGER_ROWS = [
  {
    op: "edit",
    name: "Southern California Edison",
    detail: "fields: service_area_km2, customers \u00b7 2 changes",
    author: "MK",
    authorName: "maria.kellogg",
    type: "utility",
    time: "2m ago",
  },
  {
    op: "add",
    name: "Cimarron Bend III Wind Project",
    detail: "Kansas \u00b7 199 MW \u00b7 commissioned 2025-11",
    author: "JT",
    authorName: "jtorres",
    type: "power plant",
    time: "14m ago",
  },
  {
    op: "fix",
    name: "CAISO SP15 load zone",
    detail: "boundary correction \u00b7 cited CAISO 2026-Q1 OASIS",
    author: "AR",
    authorName: "a.reyes",
    type: "pricing node",
    time: "38m ago",
  },
  {
    op: "edit",
    name: "ConEd residential rate \u00b7 SC-1",
    detail: "TOU windows updated per April 2026 tariff filing",
    author: "SP",
    authorName: "sparikh",
    type: "tariff",
    time: "1h ago",
  },
  {
    op: "merge",
    name: "PR #4,182 \u00b7 Puerto Rico EV station backfill",
    detail: "247 stations added \u00b7 moderators: 2 approvals",
    author: "DK",
    authorName: "d.kowalski",
    type: "batch \u00b7 ev",
    time: "2h ago",
  },
  {
    op: "add",
    name: "Vineyard Wind 1",
    detail: "Massachusetts \u00b7 806 MW offshore \u00b7 Avangrid / CIP",
    author: "LN",
    authorName: "l.nguyen",
    type: "power plant",
    time: "3h ago",
  },
  {
    op: "edit",
    name: "Dominion Energy VA \u00b7 rider T1",
    detail: "clarified applicability to interconnection class 3",
    author: "RC",
    authorName: "rchen",
    type: "program",
    time: "4h ago",
  },
  {
    op: "fix",
    name: "MISO \u00b7 Entergy Louisiana BA mapping",
    detail: "corrected from ERCOT classification (regression)",
    author: "TM",
    authorName: "t.moreno",
    type: "operator",
    time: "5h ago",
  },
];

const ENDPOINT_DEFS = [
  { path: "/utilities", countKey: "utilities" as const, suffix: "records" },
  { path: "/territories/lookup", desc: "point-in-polygon" },
  { path: "/isos", countKey: "gridOperators" as const, suffix: "ISOs + RTOs + BAs" },
  { path: "/power-plants", countKey: "powerPlants" as const, suffix: "records" },
  { path: "/transmission-lines", countKey: "transmissionLines" as const, suffix: "lines" },
  { path: "/ev-stations", countKey: "evStations" as const, suffix: "stations" },
  { path: "/pricing-nodes", countKey: "pricingNodes" as const, suffix: "nodes" },
  { path: "/programs", countKey: "programs" as const, suffix: "programs" },
  { path: "/search", desc: "full-text" },
  { path: "/changelog", desc: "every edit, attributed" },
];

const ArrowIcon = () => (
  <svg
    aria-hidden="true"
    className="entity-arrow"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </svg>
);

export default function LandingPage() {
  const counts = useEntityCounts();

  const gridOperatorCount =
    counts.isos !== null && counts.rtos !== null && counts.balancingAuthorities !== null
      ? counts.isos + counts.rtos + counts.balancingAuthorities
      : null;

  const dynamicCounts: Record<string, string> = {
    utilities: formatCount(counts.utilities),
    gridOperators: formatCount(gridOperatorCount),
    programs: formatCount(counts.programs),
    powerPlants: formatCount(counts.powerPlants),
    transmissionLines: formatCount(counts.transmissionLines),
    evStations: formatCount(counts.evStations),
    pricingNodes: formatCount(counts.pricingNodes),
  };

  return (
    <div className="cg-home">
      {/* ── Hero ── */}
      <header className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="pulse" />
                An open data commons &middot; continuously updated
              </span>
              <h1 className="hero-h1">The open registry of U.S. energy infrastructure.</h1>
              <p className="hero-lede">
                CommonGrid is a public, citable database of every U.S. electric utility, territory, ISO, market node,
                and major asset &mdash; maintained by the people who work with this data every day. Free to read, edit,
                cite, and build on.
              </p>
              <div className="hero-cta">
                <Link href="/explore" className="btn btn-primary btn-lg">
                  Explore the registry
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14m-5-5 5 5-5 5" />
                  </svg>
                </Link>
              </div>
            </div>

            <div className="hero-visual">
              <div className="map-frame">
                <div className="map">
                  <svg viewBox="-51.7 -56.0 740.8 448.0" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                    <g className="hex-states">
                      <polygon
                        data-st="ME"
                        points="582.0,-16.0 582.0,16.0 554.3,32.0 526.5,16.0 526.5,-16.0 554.3,-32.0"
                        fill="#88b828"
                        fillOpacity="0.55"
                        stroke="#5a7d14"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="AK"
                        points="55.4,32.0 55.4,64.0 27.7,80.0 -0.0,64.0 0.0,32.0 27.7,16.0"
                        fill="#b8b0a0"
                        fillOpacity="0.55"
                        stroke="#807868"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="VT"
                        points="554.3,32.0 554.3,64.0 526.5,80.0 498.8,64.0 498.8,32.0 526.5,16.0"
                        fill="#88b828"
                        fillOpacity="0.55"
                        stroke="#5a7d14"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="NH"
                        points="609.7,32.0 609.7,64.0 582.0,80.0 554.3,64.0 554.3,32.0 582.0,16.0"
                        fill="#88b828"
                        fillOpacity="0.55"
                        stroke="#5a7d14"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="WA"
                        points="83.1,80.0 83.1,112.0 55.4,128.0 27.7,112.0 27.7,80.0 55.4,64.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="MT"
                        points="138.6,80.0 138.6,112.0 110.9,128.0 83.1,112.0 83.1,80.0 110.9,64.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="ND"
                        points="194.0,80.0 194.0,112.0 166.3,128.0 138.6,112.0 138.6,80.0 166.3,64.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="MN"
                        points="249.4,80.0 249.4,112.0 221.7,128.0 194.0,112.0 194.0,80.0 221.7,64.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="WI"
                        points="304.8,80.0 304.8,112.0 277.1,128.0 249.4,112.0 249.4,80.0 277.1,64.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="MI"
                        points="415.7,80.0 415.7,112.0 388.0,128.0 360.3,112.0 360.3,80.0 388.0,64.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="NY"
                        points="471.1,80.0 471.1,112.0 443.4,128.0 415.7,112.0 415.7,80.0 443.4,64.0"
                        fill="#3db8c8"
                        fillOpacity="0.55"
                        stroke="#207985"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="MA"
                        points="526.5,80.0 526.5,112.0 498.8,128.0 471.1,112.0 471.1,80.0 498.8,64.0"
                        fill="#88b828"
                        fillOpacity="0.55"
                        stroke="#5a7d14"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="OR"
                        points="110.9,128.0 110.9,160.0 83.1,176.0 55.4,160.0 55.4,128.0 83.1,112.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="ID"
                        points="166.3,128.0 166.3,160.0 138.6,176.0 110.9,160.0 110.9,128.0 138.6,112.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="SD"
                        points="221.7,128.0 221.7,160.0 194.0,176.0 166.3,160.0 166.3,128.0 194.0,112.0"
                        fill="#d88420"
                        fillOpacity="0.55"
                        stroke="#8f5410"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="IA"
                        points="277.1,128.0 277.1,160.0 249.4,176.0 221.7,160.0 221.7,128.0 249.4,112.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="IL"
                        points="332.6,128.0 332.6,160.0 304.8,176.0 277.1,160.0 277.1,128.0 304.8,112.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="IN"
                        points="388.0,128.0 388.0,160.0 360.3,176.0 332.6,160.0 332.6,128.0 360.3,112.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="OH"
                        points="443.4,128.0 443.4,160.0 415.7,176.0 388.0,160.0 388.0,128.0 415.7,112.0"
                        fill="#5f5aa8"
                        fillOpacity="0.55"
                        stroke="#34306f"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="PA"
                        points="498.8,128.0 498.8,160.0 471.1,176.0 443.4,160.0 443.4,128.0 471.1,112.0"
                        fill="#5f5aa8"
                        fillOpacity="0.55"
                        stroke="#34306f"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="NJ"
                        points="554.3,128.0 554.3,160.0 526.5,176.0 498.8,160.0 498.8,128.0 526.5,112.0"
                        fill="#5f5aa8"
                        fillOpacity="0.55"
                        stroke="#34306f"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="CT"
                        points="609.7,128.0 609.7,160.0 582.0,176.0 554.3,160.0 554.3,128.0 582.0,112.0"
                        fill="#88b828"
                        fillOpacity="0.55"
                        stroke="#5a7d14"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="RI"
                        points="665.1,128.0 665.1,160.0 637.4,176.0 609.7,160.0 609.7,128.0 637.4,112.0"
                        fill="#88b828"
                        fillOpacity="0.55"
                        stroke="#5a7d14"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="CA"
                        points="83.1,176.0 83.1,208.0 55.4,224.0 27.7,208.0 27.7,176.0 55.4,160.0"
                        fill="#e8b24a"
                        fillOpacity="0.55"
                        stroke="#a47818"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="NV"
                        points="138.6,176.0 138.6,208.0 110.9,224.0 83.1,208.0 83.1,176.0 110.9,160.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="UT"
                        points="194.0,176.0 194.0,208.0 166.3,224.0 138.6,208.0 138.6,176.0 166.3,160.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="WY"
                        points="249.4,176.0 249.4,208.0 221.7,224.0 194.0,208.0 194.0,176.0 221.7,160.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="NE"
                        points="304.8,176.0 304.8,208.0 277.1,224.0 249.4,208.0 249.4,176.0 277.1,160.0"
                        fill="#d88420"
                        fillOpacity="0.55"
                        stroke="#8f5410"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="MO"
                        points="360.3,176.0 360.3,208.0 332.6,224.0 304.8,208.0 304.8,176.0 332.6,160.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="KY"
                        points="415.7,176.0 415.7,208.0 388.0,224.0 360.3,208.0 360.3,176.0 388.0,160.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="WV"
                        points="471.1,176.0 471.1,208.0 443.4,224.0 415.7,208.0 415.7,176.0 443.4,160.0"
                        fill="#5f5aa8"
                        fillOpacity="0.55"
                        stroke="#34306f"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="VA"
                        points="526.5,176.0 526.5,208.0 498.8,224.0 471.1,208.0 471.1,176.0 498.8,160.0"
                        fill="#5f5aa8"
                        fillOpacity="0.55"
                        stroke="#34306f"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="MD"
                        points="582.0,176.0 582.0,208.0 554.3,224.0 526.5,208.0 526.5,176.0 554.3,160.0"
                        fill="#5f5aa8"
                        fillOpacity="0.55"
                        stroke="#34306f"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="DE"
                        points="637.4,176.0 637.4,208.0 609.7,224.0 582.0,208.0 582.0,176.0 609.7,160.0"
                        fill="#5f5aa8"
                        fillOpacity="0.55"
                        stroke="#34306f"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="AZ"
                        points="166.3,224.0 166.3,256.0 138.6,272.0 110.9,256.0 110.9,224.0 138.6,208.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="CO"
                        points="221.7,224.0 221.7,256.0 194.0,272.0 166.3,256.0 166.3,224.0 194.0,208.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="NM"
                        points="277.1,224.0 277.1,256.0 249.4,272.0 221.7,256.0 221.7,224.0 249.4,208.0"
                        fill="#c9c3b4"
                        fillOpacity="0.55"
                        stroke="#8a8470"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="KS"
                        points="332.6,224.0 332.6,256.0 304.8,272.0 277.1,256.0 277.1,224.0 304.8,208.0"
                        fill="#d88420"
                        fillOpacity="0.55"
                        stroke="#8f5410"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="AR"
                        points="388.0,224.0 388.0,256.0 360.3,272.0 332.6,256.0 332.6,224.0 360.3,208.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="TN"
                        points="443.4,224.0 443.4,256.0 415.7,272.0 388.0,256.0 388.0,224.0 415.7,208.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="NC"
                        points="498.8,224.0 498.8,256.0 471.1,272.0 443.4,256.0 443.4,224.0 471.1,208.0"
                        fill="#c07860"
                        fillOpacity="0.55"
                        stroke="#8a4e38"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="SC"
                        points="554.3,224.0 554.3,256.0 526.5,272.0 498.8,256.0 498.8,224.0 526.5,208.0"
                        fill="#c07860"
                        fillOpacity="0.55"
                        stroke="#8a4e38"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="HI"
                        points="27.7,272.0 27.7,304.0 0.0,320.0 -27.7,304.0 -27.7,272.0 -0.0,256.0"
                        fill="#b8b0a0"
                        fillOpacity="0.55"
                        stroke="#807868"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="OK"
                        points="249.4,272.0 249.4,304.0 221.7,320.0 194.0,304.0 194.0,272.0 221.7,256.0"
                        fill="#d88420"
                        fillOpacity="0.55"
                        stroke="#8f5410"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="TX"
                        points="304.8,272.0 304.8,304.0 277.1,320.0 249.4,304.0 249.4,272.0 277.1,256.0"
                        fill="#d93d72"
                        fillOpacity="0.95"
                        stroke="#9a1f4c"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="LA"
                        points="360.3,272.0 360.3,304.0 332.6,320.0 304.8,304.0 304.8,272.0 332.6,256.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="MS"
                        points="415.7,272.0 415.7,304.0 388.0,320.0 360.3,304.0 360.3,272.0 388.0,256.0"
                        fill="#6b88cc"
                        fillOpacity="0.55"
                        stroke="#3f5aa0"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="AL"
                        points="471.1,272.0 471.1,304.0 443.4,320.0 415.7,304.0 415.7,272.0 443.4,256.0"
                        fill="#c07860"
                        fillOpacity="0.55"
                        stroke="#8a4e38"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="GA"
                        points="526.5,272.0 526.5,304.0 498.8,320.0 471.1,304.0 471.1,272.0 498.8,256.0"
                        fill="#c07860"
                        fillOpacity="0.55"
                        stroke="#8a4e38"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <polygon
                        data-st="FL"
                        points="498.8,320.0 498.8,352.0 471.1,368.0 443.4,352.0 443.4,320.0 471.1,304.0"
                        fill="#e18bb3"
                        fillOpacity="0.55"
                        stroke="#a24e78"
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                    </g>
                    <g
                      fontFamily="'Fira Code', ui-monospace, monospace"
                      fontSize="11"
                      fontWeight="600"
                      textAnchor="middle"
                      fill="currentColor"
                      style={{ pointerEvents: "none" }}
                    >
                      <text x="554.3" y="4.0" opacity="0.72">
                        ME
                      </text>
                      <text x="27.7" y="52.0" opacity="0.72">
                        AK
                      </text>
                      <text x="526.5" y="52.0" opacity="0.72">
                        VT
                      </text>
                      <text x="582.0" y="52.0" opacity="0.72">
                        NH
                      </text>
                      <text x="55.4" y="100.0" opacity="0.72">
                        WA
                      </text>
                      <text x="110.9" y="100.0" opacity="0.72">
                        MT
                      </text>
                      <text x="166.3" y="100.0" opacity="0.72">
                        ND
                      </text>
                      <text x="221.7" y="100.0" opacity="0.72">
                        MN
                      </text>
                      <text x="277.1" y="100.0" opacity="0.72">
                        WI
                      </text>
                      <text x="388.0" y="100.0" opacity="0.72">
                        MI
                      </text>
                      <text x="443.4" y="100.0" opacity="0.72">
                        NY
                      </text>
                      <text x="498.8" y="100.0" opacity="0.72">
                        MA
                      </text>
                      <text x="83.1" y="148.0" opacity="0.72">
                        OR
                      </text>
                      <text x="138.6" y="148.0" opacity="0.72">
                        ID
                      </text>
                      <text x="194.0" y="148.0" opacity="0.72">
                        SD
                      </text>
                      <text x="249.4" y="148.0" opacity="0.72">
                        IA
                      </text>
                      <text x="304.8" y="148.0" opacity="0.72">
                        IL
                      </text>
                      <text x="360.3" y="148.0" opacity="0.72">
                        IN
                      </text>
                      <text x="415.7" y="148.0" opacity="0.72">
                        OH
                      </text>
                      <text x="471.1" y="148.0" opacity="0.72">
                        PA
                      </text>
                      <text x="526.5" y="148.0" opacity="0.72">
                        NJ
                      </text>
                      <text x="582.0" y="148.0" opacity="0.72">
                        CT
                      </text>
                      <text x="637.4" y="148.0" opacity="0.72">
                        RI
                      </text>
                      <text x="55.4" y="196.0" opacity="0.72">
                        CA
                      </text>
                      <text x="110.9" y="196.0" opacity="0.72">
                        NV
                      </text>
                      <text x="166.3" y="196.0" opacity="0.72">
                        UT
                      </text>
                      <text x="221.7" y="196.0" opacity="0.72">
                        WY
                      </text>
                      <text x="277.1" y="196.0" opacity="0.72">
                        NE
                      </text>
                      <text x="332.6" y="196.0" opacity="0.72">
                        MO
                      </text>
                      <text x="388.0" y="196.0" opacity="0.72">
                        KY
                      </text>
                      <text x="443.4" y="196.0" opacity="0.72">
                        WV
                      </text>
                      <text x="498.8" y="196.0" opacity="0.72">
                        VA
                      </text>
                      <text x="554.3" y="196.0" opacity="0.72">
                        MD
                      </text>
                      <text x="609.7" y="196.0" opacity="0.72">
                        DE
                      </text>
                      <text x="138.6" y="244.0" opacity="0.72">
                        AZ
                      </text>
                      <text x="194.0" y="244.0" opacity="0.72">
                        CO
                      </text>
                      <text x="249.4" y="244.0" opacity="0.72">
                        NM
                      </text>
                      <text x="304.8" y="244.0" opacity="0.72">
                        KS
                      </text>
                      <text x="360.3" y="244.0" opacity="0.72">
                        AR
                      </text>
                      <text x="415.7" y="244.0" opacity="0.72">
                        TN
                      </text>
                      <text x="471.1" y="244.0" opacity="0.72">
                        NC
                      </text>
                      <text x="526.5" y="244.0" opacity="0.72">
                        SC
                      </text>
                      <text x="0.0" y="292.0" opacity="0.72">
                        HI
                      </text>
                      <text x="221.7" y="292.0" opacity="0.72">
                        OK
                      </text>
                      <text x="277.1" y="292.0" opacity="1">
                        TX
                      </text>
                      <text x="332.6" y="292.0" opacity="0.72">
                        LA
                      </text>
                      <text x="388.0" y="292.0" opacity="0.72">
                        MS
                      </text>
                      <text x="443.4" y="292.0" opacity="0.72">
                        AL
                      </text>
                      <text x="498.8" y="292.0" opacity="0.72">
                        GA
                      </text>
                      <text x="471.1" y="340.0" opacity="0.72">
                        FL
                      </text>
                    </g>
                  </svg>
                  <div className="map-legend">
                    <div className="row">
                      <span className="sw" style={{ background: "#d93d72", opacity: 0.9 }} />
                      <span>ERCOT</span>
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: "#5f5aa8", opacity: 0.55 }} />
                      <span>PJM</span>
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: "#6b88cc", opacity: 0.55 }} />
                      <span>MISO</span>
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: "#88b828", opacity: 0.55 }} />
                      <span>ISO-NE</span>
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: "#3db8c8", opacity: 0.55 }} />
                      <span>NYISO</span>
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: "#e8b24a", opacity: 0.55 }} />
                      <span>CAISO</span>
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: "#d88420", opacity: 0.55 }} />
                      <span>SPP</span>
                    </div>
                    <div className="row">
                      <span className="sw" style={{ background: "#c07860", opacity: 0.55 }} />
                      <span>SERC &middot; FRCC</span>
                    </div>
                    <div className="row" style={{ gridColumn: "span 2" }}>
                      <span className="sw" style={{ background: "#c9c3b4", opacity: 0.7 }} />
                      <span>WECC &middot; other</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats band */}
          <ul className="stats" aria-label="Registry contents">
            <li className="stat">
              <span className="stat-n">{formatCount(counts.utilities)}</span>
              <span className="stat-l">Utilities</span>
            </li>
            <li className="stat">
              <span className="stat-n">{formatCount(gridOperatorCount)}</span>
              <span className="stat-l">Grid operators</span>
            </li>
            <li className="stat">
              <span className="stat-n">{formatCount(counts.powerPlants)}</span>
              <span className="stat-l">Power plants</span>
            </li>
            <li className="stat">
              <span className="stat-n">{formatCount(counts.transmissionLines)}</span>
              <span className="stat-l">Transmission lines</span>
            </li>
            <li className="stat">
              <span className="stat-n">{formatCount(counts.evStations)}</span>
              <span className="stat-l">EV stations</span>
            </li>
          </ul>
        </div>
      </header>

      {/* ── Entity grid ── */}
      <section id="browse">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="kicker">01 &middot; Browse</div>
              <h2 className="section-title">Eight entry points, one connected graph.</h2>
            </div>
            <p className="section-desc">
              Every utility links to its territory, every territory to its operator, every plant to its interconnection.
              Start anywhere.
            </p>
          </div>

          <div className="entities">
            {ENTITY_CARDS.map((card) => {
              const count = card.count ?? (card.countKey ? dynamicCounts[card.countKey] : undefined);
              return (
                <Link key={card.num} href={card.href} className="entity">
                  <div className="entity-head">
                    <span>
                      {card.num} &middot; {card.cat}
                    </span>
                    <span className="entity-count tabular">{count}</span>
                  </div>
                  <div className="entity-name">{card.name}</div>
                  <p className="entity-desc">{card.desc}</p>
                  <div className="entity-foot">
                    <div className="entity-tags">
                      {card.tags.map((tag) => (
                        <span key={tag} className="entity-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <ArrowIcon />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Ledger / Recent activity ── */}
      <section id="ledger">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="kicker">02 &middot; Living registry</div>
              <h2 className="section-title">Every edit is citable, attributed, and reversible.</h2>
            </div>
            <p className="section-desc">
              CommonGrid is built like a wiki, not a dump. Every change is a diff with an author, a source, and a
              timestamp. Every record has a history. Nothing is silently overwritten.
            </p>
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: CSS grid layout, not a semantic table */}
          <div className="ledger" role="table" aria-label="Recent changes">
            <div className="ledger-head">
              <span>Change</span>
              <span>Entity</span>
              <span>Contributor</span>
              <span>Type</span>
              <span>When</span>
            </div>
            {LEDGER_ROWS.map((row) => (
              <div key={row.name} className="ledger-row">
                <span className={`op op-${row.op}`}>{row.op}</span>
                <div className="ledger-name">
                  <span className="n">{row.name}</span>
                  <span className="s">{row.detail}</span>
                </div>
                <div className="ledger-author">
                  <span className="av">{row.author}</span>
                  <span>{row.authorName}</span>
                </div>
                <span className="ledger-type">{row.type}</span>
                <span className="ledger-time tabular">{row.time}</span>
              </div>
            ))}
          </div>

          <div className="ledger-foot">
            <span className="tabular mono" style={{ fontSize: "12px" }}>
              +312 changes in the last 24h &middot; +2,104 this week
            </span>
            <Link href="/changelog">View full changelog &rarr;</Link>
          </div>
        </div>
      </section>

      {/* ── Commons ribbon ── */}
      <section id="commons">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="kicker">03 &middot; The commons</div>
              <h2 className="section-title">Public infrastructure deserves public data.</h2>
            </div>
            <p className="section-desc">
              The grid is a shared good. The knowledge of how it&rsquo;s structured should be, too &mdash; available to
              regulators, researchers, startups, utilities, and anyone building what comes next.
            </p>
          </div>

          <div className="commons">
            <div className="commons-cell">
              <div className="q">Why open?</div>
              <h4>Fragmentation is the tax.</h4>
              <p>
                EIA forms, FERC filings, HIFLD shapefiles, state dockets, GIS exports &mdash; every serious grid
                question begins with three weeks of data plumbing. CommonGrid pays that cost once, for everyone.
              </p>
            </div>
            <div className="commons-cell">
              <div className="q">Who maintains it?</div>
              <h4>People who work with this data.</h4>
              <p>
                Utility engineers, researchers, analysts at ISOs, and developers at energy startups. Contributors and a
                small elected moderation team. Texture funds the infrastructure; the project governs itself.
              </p>
            </div>
            <div className="commons-cell">
              <div className="q">What&rsquo;s the license?</div>
              <h4>ODbL 1.0 &mdash; free, forever.</h4>
              <p>
                Use it commercially. Build products on it. Redistribute it. The only obligation is attribution and
                sharing improvements back. Same license as OpenStreetMap.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contribute / Governance ── */}
      <section id="contribute">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="kicker">04 &middot; Contribute</div>
              <h2 className="section-title">How an edit becomes part of the record.</h2>
            </div>
            <p className="section-desc">
              Low-friction for small fixes, structured for big changes. Anyone can propose; trusted contributors are
              auto-merged on uncontroversial fields; all changes are reversible.
            </p>
          </div>

          <div className="govern">
            <div className="steps">
              <div className="step">
                <div className="step-num">01</div>
                <div>
                  <h4>Propose</h4>
                  <p>
                    Hit{" "}
                    <span
                      className="mono"
                      style={{
                        fontSize: "12px",
                        background: "var(--cg-accent-pastel)",
                        color: "var(--cg-accent-dark)",
                        padding: "1px 5px",
                        borderRadius: "3px",
                      }}
                    >
                      Suggest edit
                    </span>{" "}
                    on any page. Cite a source. Describe what changed and why. Takes ~60 seconds for a field fix.
                  </p>
                </div>
                <span className="step-meta">median: 43 s</span>
              </div>
              <div className="step">
                <div className="step-num">02</div>
                <div>
                  <h4>Review</h4>
                  <p>
                    Moderators check citations and weigh conflicts. Trusted contributors skip review for non-critical
                    fields. Contested changes trigger a discussion thread on the entity.
                  </p>
                </div>
                <span className="step-meta">median: 2.4 h</span>
              </div>
              <div className="step">
                <div className="step-num">03</div>
                <div>
                  <h4>Merge &amp; ripple</h4>
                  <p>
                    Merged edits land in the next hourly snapshot, fan out to the API, and show up in the changelog with
                    a permanent diff. Anything can be reverted in one click.
                  </p>
                </div>
                <span className="step-meta">median: 1 h until live</span>
              </div>
              <div className="step">
                <div className="step-num">04</div>
                <div>
                  <h4>Attribute</h4>
                  <p>
                    Every record carries its full edit history and citation trail. Researchers can cite a specific
                    revision; auditors can see exactly who touched what.
                  </p>
                </div>
                <span className="step-meta">permanent</span>
              </div>
            </div>

            <aside className="license-card">
              <h4>ODbL 1.0</h4>
              <p className="sub">
                Open Database License &mdash; the same license as OpenStreetMap. Use it anywhere, including commercial
                products. Attribute CommonGrid, and share improvements back.
              </p>
              <div className="license-row">
                <span>Use commercially</span>
                <span>&#10003; allowed</span>
              </div>
              <div className="license-row">
                <span>Redistribute</span>
                <span>&#10003; allowed</span>
              </div>
              <div className="license-row">
                <span>Modify &amp; derive</span>
                <span>&#10003; allowed</span>
              </div>
              <div className="license-row">
                <span>Attribution required</span>
                <span>yes</span>
              </div>
              <div className="license-row">
                <span>Share-alike for derivatives</span>
                <span>yes</span>
              </div>
              <div className="license-row">
                <span>License</span>
                <span>ODbL 1.0</span>
              </div>
              <div style={{ marginTop: "18px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <a
                  href="https://opendatacommons.org/licenses/odbl/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                >
                  Full license text
                </a>
                <Link
                  href="/about"
                  className="btn"
                  style={{ background: "var(--cg-ink)", color: "var(--cg-paper)", borderColor: "var(--cg-ink)" }}
                >
                  Governance charter &rarr;
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── Developer ── */}
      <section id="developers">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="kicker">05 &middot; For developers</div>
              <h2 className="section-title">REST API, vector tiles, weekly snapshot.</h2>
            </div>
            <p className="section-desc">
              60 requests/hour unauthenticated. 5,000/hour with a free key. Geo endpoints serve MVT tiles. Full database
              dumps published weekly under ODbL.
            </p>
          </div>

          <div className="dev">
            <div className="dev-code">
              <div className="dev-code-head">
                <span style={{ color: "#7a86d4" }}>&bull;</span> Quickstart &middot; curl
              </div>
              <pre className="code">
                <span className="c"># every utility in California</span>
                {"\n"}
                <span className="k">curl</span>{" "}
                <span className="s">https://commongrid.info/api/v1/utilities?state=CA</span>
                {"\n\n"}
                <span className="c"># a specific power plant by slug</span>
                {"\n"}
                <span className="k">curl</span>{" "}
                <span className="s">https://commongrid.info/api/v1/power-plants/palo-verde</span>
                {"\n\n"}
                <span className="c"># which utility serves this coordinate?</span>
                {"\n"}
                <span className="k">curl</span>{" "}
                <span className="s">
                  https://commongrid.info/api/v1/territories/lookup?lat=<span className="m">30.2672</span>
                  &amp;lng=<span className="m">-97.7431</span>
                </span>
                {"\n\n"}
                <span className="c"># state of a record at a point in time</span>
                {"\n"}
                <span className="k">curl</span>{" "}
                <span className="s">
                  https://commongrid.info/api/v1/utilities/austin-energy?at=<span className="m">2025-12-01</span>
                </span>
              </pre>
              <div className="dev-cta">
                <Link
                  href="/developers"
                  className="btn"
                  style={{ background: "transparent", color: "#faf7f0", borderColor: "#3c362d" }}
                >
                  Get an API key &rarr;
                </Link>
                <a
                  href="https://github.com/TextureHQ/commongrid#api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                  style={{ background: "transparent", color: "#a89f90", borderColor: "transparent" }}
                >
                  Read the docs
                </a>
              </div>
            </div>

            <div className="dev-endpoints">
              <div className="dev-endpoints-head">Core endpoints &middot; v1</div>
              {ENDPOINT_DEFS.map((ep) => {
                const desc = ep.desc ?? (ep.countKey ? `${dynamicCounts[ep.countKey]} ${ep.suffix}` : "");
                return (
                  <div key={ep.path} className="endpoint">
                    <span className="badge">GET</span>
                    <span className="p">{ep.path}</span>
                    <span className="d">{desc}</span>
                  </div>
                );
              })}
              <div className="endpoint">
                <span className="badge">MVT</span>
                <span className="p">/tiles/&#123;layer&#125;/&#123;z&#125;/&#123;x&#125;/&#123;y&#125;</span>
                <span className="d">vector tiles</span>
              </div>

              <div className="dev-snapshot">
                <span>Weekly snapshot &middot; .sql.gz + .geojson layers</span>
                <Link href="/snapshots">Download &rarr;</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="cg-footer">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-col">
              <Link
                href="/"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontFamily: "var(--font-family-brand)",
                  fontWeight: 700,
                  fontSize: "16px",
                  letterSpacing: "-.015em",
                  color: "var(--cg-ink)",
                  textDecoration: "none",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="4" cy="4" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="4" r="1.8" fill="currentColor" />
                  <circle cx="20" cy="4" r="1.8" fill="currentColor" />
                  <circle cx="28" cy="4" r="1.8" fill="currentColor" />
                  <circle cx="4" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="4" cy="20" r="1.8" fill="currentColor" />
                  <circle cx="28" cy="12" r="1.8" fill="currentColor" />
                  <circle cx="28" cy="20" r="1.8" fill="currentColor" />
                  <circle cx="4" cy="28" r="1.8" fill="currentColor" />
                  <circle cx="12" cy="28" r="1.8" fill="currentColor" />
                  <circle cx="20" cy="28" r="1.8" fill="currentColor" />
                  <circle cx="28" cy="28" r="1.8" fill="currentColor" />
                  <rect x="11" y="11" width="10" height="10" rx="1.5" fill="currentColor" />
                </svg>
                <span>CommonGrid</span>
              </Link>
              <p className="foot-about">
                A public registry of U.S. energy infrastructure, maintained by its users. Released into the commons
                under ODbL 1.0.
              </p>
              <div className="foot-backed">
                <span>Incubated &amp; backed by</span>
                <span className="tx">Texture</span>
              </div>
            </div>
            <div className="foot-col">
              <h5>The data</h5>
              <Link href="/grid-operators">Utilities</Link>
              <Link href="/explore">Territories</Link>
              <Link href="/grid-operators">Operators</Link>
              <Link href="/power-plants">Power plants</Link>
              <Link href="/ev-charging">EV charging</Link>
              <Link href="/changelog">Full changelog</Link>
            </div>
            <div className="foot-col">
              <h5>Build with it</h5>
              <Link href="/developers">REST API</Link>
              <Link href="/developers">Vector tiles</Link>
              <Link href="/snapshots">Weekly snapshots</Link>
              <Link href="/developers">API keys</Link>
              <a href="https://github.com/TextureHQ/commongrid" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </div>
            <div className="foot-col">
              <h5>The project</h5>
              <Link href="/about">About</Link>
              <Link href="/about">Governance</Link>
              <Link href="/contributions">Contributors</Link>
              <Link href="/contributions">Moderation</Link>
              <a href="https://github.com/TextureHQ/commongrid" target="_blank" rel="noopener noreferrer">
                Code of conduct
              </a>
            </div>
          </div>

          <div className="foot-bot">
            <span>
              &copy; 2026 &middot; Released under{" "}
              <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer">
                Open Database License 1.0
              </a>{" "}
              &middot; No trackers, no ads
            </span>
            <span className="mono tabular">rev 7a2f19 &middot; deployed 14:32 UTC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
