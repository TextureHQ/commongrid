"use client";

import { Skeleton } from "@texturehq/edges";
import Link from "next/link";
import { formatCount, useEntityCounts } from "@/hooks/useEntityCounts";
import "./homepage-minimal.css";

/**
 * Inline number with a Skeleton fallback while the count is loading.
 * Sized to match the stat typography (32px / tabular numerals).
 */
function StatNumber({ value, width = 96 }: { value: number | null; width?: number | string }) {
  if (value === null) {
    return <Skeleton width={width} height={32} variant="rect" animation="pulse" ariaLabel="Loading metric" />;
  }
  return <>{formatCount(value)}</>;
}

const RATE_SCHEDULE_COUNT = "~12k";

const ENTITY_CARDS = [
  {
    num: "01",
    cat: "Operators",
    href: "/grid-operators",
    name: "Electric utilities",
    desc: "All U.S. utilities — IOUs, co-ops, munis, and federal power agencies. Filtered by state, segment, and ISO.",
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
    desc: "Demand response, rebates, EV programs, VPP — queryable by asset type, segment, and territory.",
    countKey: "programs" as const,
    tags: ["Structured", "Citable"],
  },
  {
    num: "04",
    cat: "Tariffs",
    href: "/explore?view=rates",
    name: "Rates & tariffs",
    desc: "Residential and commercial rate structures — TOU windows, demand charges, standby, net metering.",
    count: RATE_SCHEDULE_COUNT,
    tags: ["OpenEI", "Filed"],
  },
  {
    num: "05",
    cat: "Generation",
    href: "/power-plants",
    name: "Power plants",
    desc: "Solar, wind, nuclear, gas, hydro — EIA Form 860 normalized and connected to utilities and territories.",
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
    desc: "Every public AC and DC station in the U.S. — networks, plug standards, and power levels.",
    countKey: "evStations" as const,
    tags: ["AFDC", "OCPI"],
  },
  {
    num: "08",
    cat: "Wholesale",
    href: "/pricing-nodes",
    name: "Pricing nodes",
    desc: "Wholesale market nodes — trading hubs, load zones, SUBLAPs, and generation pricing across 7 ISOs/RTOs.",
    countKey: "pricingNodes" as const,
    tags: ["LMP", "DA / RT"],
  },
  {
    num: "09",
    cat: "Infrastructure",
    href: "/substations",
    name: "Substations",
    desc: "Step-up, step-down, and switching substations — voltage class, owner, and interconnected assets normalized from OpenStreetMap.",
    countKey: "substations" as const,
    tags: ["OSM", "≥69 kV"],
  },
];

const LEDGER_ROWS = [
  {
    op: "edit",
    name: "Southern California Edison",
    detail: "fields: service_area_km2, customers · 2 changes",
    author: "MK",
    authorName: "maria.kellogg",
    type: "utility",
    time: "2m ago",
  },
  {
    op: "add",
    name: "Cimarron Bend III Wind Project",
    detail: "Kansas · 199 MW · commissioned 2025-11",
    author: "JT",
    authorName: "jtorres",
    type: "power plant",
    time: "14m ago",
  },
  {
    op: "fix",
    name: "CAISO SP15 load zone",
    detail: "boundary correction · cited CAISO 2026-Q1 OASIS",
    author: "AR",
    authorName: "a.reyes",
    type: "pricing node",
    time: "38m ago",
  },
  {
    op: "edit",
    name: "ConEd residential rate · SC-1",
    detail: "TOU windows updated per April 2026 tariff filing",
    author: "SP",
    authorName: "sparikh",
    type: "tariff",
    time: "1h ago",
  },
  {
    op: "merge",
    name: "PR #4,182 · Puerto Rico EV station backfill",
    detail: "247 stations added · moderators: 2 approvals",
    author: "DK",
    authorName: "d.kowalski",
    type: "batch · ev",
    time: "2h ago",
  },
  {
    op: "add",
    name: "Vineyard Wind 1",
    detail: "Massachusetts · 806 MW offshore · Avangrid / CIP",
    author: "LN",
    authorName: "l.nguyen",
    type: "power plant",
    time: "3h ago",
  },
  {
    op: "edit",
    name: "Dominion Energy VA · rider T1",
    detail: "clarified applicability to interconnection class 3",
    author: "RC",
    authorName: "rchen",
    type: "program",
    time: "4h ago",
  },
  {
    op: "fix",
    name: "MISO · Entergy Louisiana BA mapping",
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
  { path: "/substations", countKey: "substations" as const, suffix: "substations" },
  { path: "/programs", countKey: "programs" as const, suffix: "programs" },
  { path: "/search", desc: "full-text" },
  { path: "/changelog", desc: "every edit, attributed" },
];

const ArrowIcon = () => (
  <svg
    aria-hidden="true"
    className="text-text-caption transition-all duration-200 ease-in-out group-hover:text-brand-primary group-hover:translate-x-0.5 shrink-0"
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

const opColors = {
  add: "bg-moss-pastel text-feedback-success-text border-moss-base/50",
  edit: "bg-honey-pastel text-feedback-warning-text border-honey-base/50",
  fix: "bg-ocean-pastel text-feedback-info-text border-ocean-base/50",
  merge: "bg-rose-pastel text-feedback-error-text border-rose-base/50",
} as const;

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
    substations: formatCount(counts.substations),
  };

  return (
    <div className="font-sans antialiased text-text-body bg-background-body">
      {/* ── Hero ── */}
      <header className="py-[clamp(40px,6vw,88px)] pb-[clamp(32px,5vw,56px)]">
        <div className="max-w-[1280px] mx-auto px-[clamp(20px,4vw,56px)]">
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-[clamp(32px,5vw,64px)] items-center">
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-display-lg-size)] font-[var(--text-display-lg-weight)] leading-[var(--text-display-lg-line-height)] tracking-[var(--text-display-lg-letter-spacing)] mb-6 max-w-[17ch] text-text-heading [text-wrap:balance]">
                The open registry of U.S. energy infrastructure.
              </h1>
              <p className="text-[length:var(--text-body-lg-size)] font-[var(--text-body-lg-weight)] leading-[var(--text-body-lg-line-height)] tracking-[var(--text-body-lg-letter-spacing)] text-text-muted max-w-[60ch] m-0 [text-wrap:pretty]">
                A public, citable database of every U.S. electric utility, territory, ISO, market node, and major asset.
                Free to read, edit, cite, and build on.
              </p>
            </div>

            <Link
              href="/explore"
              className="block no-underline text-inherit min-w-0 relative"
              aria-label="Explore the registry on the interactive map"
            >
              <div className="relative border border-border-default rounded-sm overflow-hidden bg-background-surface shadow-md aspect-[740/448] transition-all duration-200 ease-in-out hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-border-emphasis focus-visible:outline-offset-2">
                <picture className="block w-full h-full map-preview-light">
                  <source srcSet="/hero-map-preview@2x.webp" type="image/webp" />
                  <img
                    src="/hero-map-preview@2x.png"
                    alt="A preview of the CommonGrid interactive map, centered on Colorado, showing utility service territories, ISO/RTO boundaries, and transmission lines."
                    width={740}
                    height={448}
                    loading="eager"
                    decoding="async"
                    className="block w-full h-full object-cover"
                  />
                </picture>
                <picture className="block w-full h-full map-preview-dark">
                  <source srcSet="/hero-map-preview-dark@2x.webp" type="image/webp" />
                  <img
                    src="/hero-map-preview-dark@2x.png"
                    alt=""
                    width={740}
                    height={448}
                    loading="eager"
                    decoding="async"
                    className="block w-full h-full object-cover"
                  />
                </picture>
                <span className="absolute right-5 bottom-5 pointer-events-none inline-flex items-center gap-2 h-12 px-6 rounded-md text-sm font-medium leading-none border border-text-heading bg-text-heading text-background-body transition-all duration-200 ease-in-out shadow-[0_6px_20px_rgba(0,0,0,0.18)] hover:shadow-[0_10px_26px_rgba(0,0,0,0.22)] hover:-translate-y-px">
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
                </span>
              </div>
            </Link>
          </div>

          {/* Stats band */}
          <ul
            className="flex flex-wrap gap-x-12 gap-y-8 mt-[clamp(40px,5vw,64px)] pt-[clamp(40px,5vw,64px)] border-t border-border-default"
            aria-label="Registry contents"
          >
            {[
              { value: counts.utilities, label: "Utilities", width: 72 },
              { value: gridOperatorCount, label: "Grid operators", width: 44 },
              { value: counts.powerPlants, label: "Power plants", width: 88 },
              { value: counts.transmissionLines, label: "Transmission lines", width: 92 },
              { value: counts.evStations, label: "EV stations", width: 96 },
            ].map((stat) => (
              <li key={stat.label} className="flex flex-col gap-1.5 min-w-[140px]">
                <span className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-heading-xl-size)] font-[var(--text-heading-xl-weight)] leading-[var(--text-heading-xl-line-height)] tracking-[var(--text-heading-xl-letter-spacing)] tabular-nums text-text-heading">
                  <StatNumber value={stat.value} width={stat.width} />
                </span>
                <span className="font-[family-name:var(--font-fira-code)] text-[length:var(--text-caption-size)] font-medium leading-[var(--text-caption-line-height)] text-text-muted">
                  {stat.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      {/* ── Entity grid ── */}
      <section id="browse" className="py-[clamp(64px,8vw,96px)] border-t border-border-default">
        <div className="max-w-[1280px] mx-auto px-[clamp(20px,4vw,56px)]">
          <div className="grid md:grid-cols-2 gap-6 mb-10 items-end">
            <div>
              <h2 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-display-md-size)] font-[var(--text-display-md-weight)] leading-[var(--text-display-md-line-height)] tracking-[var(--text-display-md-letter-spacing)] text-text-heading max-w-[22ch] m-0 [text-wrap:balance]">
                Nine entry points, one connected graph.
              </h2>
            </div>
            <p className="text-[length:var(--text-body-md-size)] font-[var(--text-body-md-weight)] leading-[var(--text-body-md-line-height)] tracking-[var(--text-body-md-letter-spacing)] text-text-muted max-w-[50ch] m-0 [text-wrap:pretty]">
              Every utility links to its territory, every territory to its operator, every plant to its interconnection.
              Start anywhere.
            </p>
          </div>

          <div className="grid md:grid-cols-3 sm:grid-cols-2 grid-cols-1 border-t border-l border-border-default">
            {ENTITY_CARDS.map((card) => {
              const count = card.count ?? (card.countKey ? dynamicCounts[card.countKey] : undefined);
              return (
                <Link
                  key={card.num}
                  href={card.href}
                  className="group p-6 border-r border-b border-border-default flex flex-col gap-1.5 min-h-[220px] relative cursor-pointer transition-colors duration-150 text-inherit no-underline hover:bg-[color-mix(in_srgb,var(--color-text-heading)_3%,transparent)]"
                >
                  <div className="flex items-start justify-between gap-3 font-[family-name:var(--font-fira-code)] text-xs font-medium text-text-muted">
                    <span>
                      {card.num} · {card.cat}
                    </span>
                    <span className="tabular-nums text-text-heading font-medium">{count}</span>
                  </div>
                  <div className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-heading-md-size)] font-[var(--text-heading-md-weight)] leading-[var(--text-heading-md-line-height)] tracking-[var(--text-heading-md-letter-spacing)] text-text-heading my-3 mt-3 mb-1">
                    {card.name}
                  </div>
                  <p className="text-[length:var(--text-body-sm-size)] font-[var(--text-body-sm-weight)] leading-[var(--text-body-sm-line-height)] tracking-[var(--text-body-sm-letter-spacing)] text-text-muted my-1 mb-auto [text-wrap:pretty]">
                    {card.desc}
                  </p>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-dashed border-border-muted">
                    <div className="flex gap-1.5 flex-wrap">
                      {card.tags.map((tag) => (
                        <span
                          key={tag}
                          className="font-[family-name:var(--font-fira-code)] text-[11px] text-text-caption py-0.5 px-1.5 border border-border-default rounded-sm tracking-[.02em]"
                        >
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
      <section id="ledger" className="py-[clamp(64px,8vw,96px)] border-t border-border-default">
        <div className="max-w-[1280px] mx-auto px-[clamp(20px,4vw,56px)]">
          <div className="grid md:grid-cols-2 gap-6 mb-10 items-end">
            <div>
              <h2 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-display-md-size)] font-[var(--text-display-md-weight)] leading-[var(--text-display-md-line-height)] tracking-[var(--text-display-md-letter-spacing)] text-text-heading max-w-[22ch] m-0 [text-wrap:balance]">
                Every edit is citable, attributed, and reversible.
              </h2>
            </div>
            <p className="text-[length:var(--text-body-md-size)] font-[var(--text-body-md-weight)] leading-[var(--text-body-md-line-height)] tracking-[var(--text-body-md-letter-spacing)] text-text-muted max-w-[50ch] m-0 [text-wrap:pretty]">
              CommonGrid is built like a wiki, not a dump. Every change is a diff with an author, a source, and a
              timestamp. Every record has a history. Nothing is silently overwritten.
            </p>
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: CSS grid layout, not a semantic table */}
          <div
            className="border border-border-default rounded-sm overflow-hidden bg-background-surface"
            role="table"
            aria-label="Recent changes"
          >
            <div className="grid grid-cols-[56px_minmax(0,1.8fr)_160px_110px_88px] md:grid-cols-[56px_1fr_80px] items-center gap-x-4 p-2.5 px-4 border-b border-border-default font-[family-name:var(--font-fira-code)] text-[11px] text-text-caption bg-[color-mix(in_srgb,var(--color-text-heading)_3%,transparent)]">
              <span>Change</span>
              <span>Entity</span>
              <span className="md:hidden">Contributor</span>
              <span className="md:hidden">Type</span>
              <span>When</span>
            </div>
            {LEDGER_ROWS.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[56px_minmax(0,1.8fr)_160px_110px_88px] md:grid-cols-[56px_1fr_80px] items-center gap-x-4 py-3.5 px-4 border-b border-border-default text-[13px] transition-colors duration-[120ms] last:border-b-0 hover:bg-[color-mix(in_srgb,var(--color-text-heading)_3%,transparent)]"
              >
                <span
                  className={`font-[family-name:var(--font-fira-code)] text-[11px] font-semibold inline-flex items-center py-0.5 px-2 rounded border w-max leading-tight ${opColors[row.op as keyof typeof opColors]}`}
                >
                  {row.op}
                </span>
                <div className="min-w-0">
                  <span className="text-text-heading font-medium block whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.name}
                  </span>
                  <span className="text-text-muted text-xs">{row.detail}</span>
                </div>
                <div className="text-text-muted text-[13px] flex items-center gap-2 md:hidden">
                  <span className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--color-brand-primary)_12%,transparent)] text-brand-dark grid place-items-center text-[10px] font-semibold shrink-0">
                    {row.author}
                  </span>
                  <span>{row.authorName}</span>
                </div>
                <span className="font-[family-name:var(--font-fira-code)] text-xs text-text-muted md:hidden">
                  {row.type}
                </span>
                <span className="font-[family-name:var(--font-fira-code)] text-xs text-text-caption text-right tabular-nums">
                  {row.time}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center mt-4.5 text-[13px] text-text-muted">
            <span className="tabular-nums font-[family-name:var(--font-fira-code)] text-xs">
              +312 changes in the last 24h · +2,104 this week
            </span>
            <Link href="/changelog" className="text-brand-primary font-medium no-underline hover:underline">
              View full changelog &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ── Commons ribbon ── */}
      <section id="commons" className="py-[clamp(64px,8vw,96px)] border-t border-border-default">
        <div className="max-w-[1280px] mx-auto px-[clamp(20px,4vw,56px)]">
          <div className="grid md:grid-cols-2 gap-6 mb-10 items-end">
            <div>
              <h2 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-display-md-size)] font-[var(--text-display-md-weight)] leading-[var(--text-display-md-line-height)] tracking-[var(--text-display-md-letter-spacing)] text-text-heading max-w-[22ch] m-0 [text-wrap:balance]">
                Public infrastructure deserves public data.
              </h2>
            </div>
            <p className="text-[length:var(--text-body-md-size)] font-[var(--text-body-md-weight)] leading-[var(--text-body-md-line-height)] tracking-[var(--text-body-md-letter-spacing)] text-text-muted max-w-[50ch] m-0 [text-wrap:pretty]">
              The grid is a shared good. The knowledge of how it&rsquo;s structured should be, too &mdash; available to
              regulators, researchers, startups, utilities, and anyone building what comes next.
            </p>
          </div>

          <div className="grid md:grid-cols-3 grid-cols-1 gap-0 border-t border-l border-border-default">
            {[
              {
                q: "Why open?",
                h: "Fragmentation is the tax.",
                p: "EIA forms, FERC filings, HIFLD shapefiles, state dockets, GIS exports — every serious grid question begins with three weeks of data plumbing. CommonGrid pays that cost once, for everyone.",
              },
              {
                q: "Who maintains it?",
                h: "People who work with this data.",
                p: "Utility engineers, researchers, analysts at ISOs, and developers at energy startups. Contributors and a small elected moderation team. Texture funds the infrastructure; the project governs itself.",
              },
              {
                q: "What's the license?",
                h: "ODbL 1.0 — free, forever.",
                p: "Use it commercially. Build products on it. Redistribute it. The only obligation is attribution and sharing improvements back. Same license as OpenStreetMap.",
              },
            ].map((cell) => (
              <div key={cell.q} className="p-7 px-6 border-r border-b border-border-default">
                <div className="font-[family-name:var(--font-fira-code)] text-xs text-rose-base mb-2.5 font-medium">
                  {cell.q}
                </div>
                <h4 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-heading-sm-size)] font-[var(--text-heading-sm-weight)] leading-[var(--text-heading-sm-line-height)] tracking-[var(--text-heading-sm-letter-spacing)] m-0 mb-3 text-text-heading">
                  {cell.h}
                </h4>
                <p className="text-[length:var(--text-body-md-size)] font-[var(--text-body-md-weight)] leading-[var(--text-body-md-line-height)] tracking-[var(--text-body-md-letter-spacing)] text-text-muted m-0">
                  {cell.p}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contribute / Governance ── */}
      <section id="contribute" className="py-[clamp(64px,8vw,96px)] border-t border-border-default">
        <div className="max-w-[1280px] mx-auto px-[clamp(20px,4vw,56px)]">
          <div className="grid md:grid-cols-2 gap-6 mb-10 items-end">
            <div>
              <h2 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-display-md-size)] font-[var(--text-display-md-weight)] leading-[var(--text-display-md-line-height)] tracking-[var(--text-display-md-letter-spacing)] text-text-heading max-w-[22ch] m-0 [text-wrap:balance]">
                How an edit becomes part of the record.
              </h2>
            </div>
            <p className="text-[length:var(--text-body-md-size)] font-[var(--text-body-md-weight)] leading-[var(--text-body-md-line-height)] tracking-[var(--text-body-md-letter-spacing)] text-text-muted max-w-[50ch] m-0 [text-wrap:pretty]">
              Low-friction for small fixes, structured for big changes. Anyone can propose; trusted contributors are
              auto-merged on uncontroversial fields; all changes are reversible.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1.1fr_.9fr] gap-[clamp(24px,5vw,64px)] items-start">
            <div className="flex flex-col border-t border-border-default">
              {[
                {
                  num: "01",
                  title: "Propose",
                  desc: (
                    <>
                      Hit{" "}
                      <span className="font-[family-name:var(--font-fira-code)] text-xs bg-[color-mix(in_srgb,var(--color-brand-primary)_12%,transparent)] text-brand-dark py-px px-1.5 rounded-sm">
                        Suggest edit
                      </span>{" "}
                      on any page. Cite a source. Describe what changed and why. Takes ~60 seconds for a field fix.
                    </>
                  ),
                  meta: "median: 43 s",
                },
                {
                  num: "02",
                  title: "Review",
                  desc: "Moderators check citations and weigh conflicts. Trusted contributors skip review for non-critical fields. Contested changes trigger a discussion thread on the entity.",
                  meta: "median: 2.4 h",
                },
                {
                  num: "03",
                  title: "Merge & ripple",
                  desc: "Merged edits land in the next hourly snapshot, fan out to the API, and show up in the changelog with a permanent diff. Anything can be reverted in one click.",
                  meta: "median: 1 h until live",
                },
                {
                  num: "04",
                  title: "Attribute",
                  desc: "Every record carries its full edit history and citation trail. Researchers can cite a specific revision; auditors can see exactly who touched what.",
                  meta: "permanent",
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="grid grid-cols-[56px_1fr_auto] gap-4.5 py-5.5 border-b border-border-default items-start"
                >
                  <div className="font-[family-name:var(--font-fira-code)] font-medium text-2xl text-rose-base leading-none tracking-normal tabular-nums">
                    {step.num}
                  </div>
                  <div>
                    <h4 className="font-[family-name:var(--font-rethink-sans)] m-0 mb-2 text-xl font-medium tracking-[-.02em] leading-tight text-text-heading">
                      {step.title}
                    </h4>
                    <p className="m-0 text-text-muted text-[15px] leading-relaxed max-w-[50ch]">{step.desc}</p>
                  </div>
                  <span className="font-[family-name:var(--font-fira-code)] text-[11px] text-text-caption whitespace-nowrap">
                    {step.meta}
                  </span>
                </div>
              ))}
            </div>

            <aside className="border border-border-paper p-7 rounded-lg bg-background-paper">
              <h4 className="m-0 mb-2 font-[family-name:var(--font-rethink-sans)] text-2xl font-medium tracking-[-0.025em] leading-[1.15] text-text-heading">
                ODbL 1.0
              </h4>
              <p className="text-text-muted text-sm m-0 mb-4.5 leading-[1.55]">
                Open Database License — the same license as OpenStreetMap. Use it anywhere, including commercial
                products. Attribute CommonGrid, and share improvements back.
              </p>
              {[
                { label: "Use commercially", value: "✓ allowed" },
                { label: "Redistribute", value: "✓ allowed" },
                { label: "Modify & derive", value: "✓ allowed" },
                { label: "Attribution required", value: "yes" },
                { label: "Share-alike for derivatives", value: "yes" },
                { label: "License", value: "ODbL 1.0" },
              ].map((row, idx) => (
                <div
                  key={row.label}
                  className={`flex justify-between py-2.5 ${idx === 0 ? "" : "border-t border-dashed border-border-muted"} text-[13px]`}
                >
                  <span className="text-text-muted text-[13px]">{row.label}</span>
                  <span className="text-text-heading font-medium font-[family-name:var(--font-fira-code)] text-xs">
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="mt-4.5 flex gap-2 flex-wrap">
                <a
                  href="https://opendatacommons.org/licenses/odbl/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium leading-none border border-border-default bg-background-surface text-text-heading transition-all duration-150 no-underline cursor-pointer hover:border-text-heading hover:text-text-heading hover:no-underline"
                >
                  Full license text
                </a>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium leading-none border border-text-heading bg-text-heading text-background-body transition-all duration-150 no-underline cursor-pointer hover:bg-text-body hover:border-text-body hover:text-background-body hover:no-underline"
                >
                  Governance charter &rarr;
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── Developer ── */}
      <section id="developers" className="py-[clamp(64px,8vw,96px)] border-t border-border-default">
        <div className="max-w-[1280px] mx-auto px-[clamp(20px,4vw,56px)]">
          <div className="grid md:grid-cols-2 gap-6 mb-10 items-end">
            <div>
              <h2 className="font-[family-name:var(--font-rethink-sans)] text-[length:var(--text-display-md-size)] font-[var(--text-display-md-weight)] leading-[var(--text-display-md-line-height)] tracking-[var(--text-display-md-letter-spacing)] text-text-heading max-w-[22ch] m-0 [text-wrap:balance]">
                REST API, vector tiles, weekly snapshot.
              </h2>
            </div>
            <p className="text-[length:var(--text-body-md-size)] font-[var(--text-body-md-weight)] leading-[var(--text-body-md-line-height)] tracking-[var(--text-body-md-letter-spacing)] text-text-muted max-w-[50ch] m-0 [text-wrap:pretty]">
              60 requests/hour unauthenticated. 5,000/hour with a free key. Geo endpoints serve MVT tiles. Full database
              dumps published weekly under ODbL.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-0 border border-border-default rounded-sm overflow-hidden">
            <div className="p-6.5 bg-gray-950 text-gray-200">
              <div className="font-[family-name:var(--font-fira-code)] text-[11px] text-gray-400 mb-3.5 flex items-center gap-2">
                <span className="text-[#7a86d4]">&bull;</span> Quickstart · curl
              </div>
              <pre className="font-[family-name:var(--font-fira-code)] text-[13px] leading-[1.75] whitespace-pre overflow-x-auto">
                <span className="cg-code-c"># every utility in California</span>
                {"\n"}
                <span className="cg-code-k">curl</span>{" "}
                <span className="cg-code-s">https://commongrid.info/api/v1/utilities?state=CA</span>
                {"\n\n"}
                <span className="cg-code-c"># a specific power plant by slug</span>
                {"\n"}
                <span className="cg-code-k">curl</span>{" "}
                <span className="cg-code-s">https://commongrid.info/api/v1/power-plants/palo-verde</span>
                {"\n\n"}
                <span className="cg-code-c"># which utility serves this coordinate?</span>
                {"\n"}
                <span className="cg-code-k">curl</span>{" "}
                <span className="cg-code-s">
                  https://commongrid.info/api/v1/territories/lookup?lat=<span className="cg-code-m">30.2672</span>
                  &amp;lng=<span className="cg-code-m">-97.7431</span>
                </span>
                {"\n\n"}
                <span className="cg-code-c"># state of a record at a point in time</span>
                {"\n"}
                <span className="cg-code-k">curl</span>{" "}
                <span className="cg-code-s">
                  https://commongrid.info/api/v1/utilities/austin-energy?at=
                  <span className="cg-code-m">2025-12-01</span>
                </span>
              </pre>
              <div className="flex gap-2 mt-5.5 flex-wrap">
                <Link
                  href="/developers"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium leading-none border transition-all duration-150 no-underline cursor-pointer bg-transparent text-[#faf7f0] border-[#3c362d] hover:border-text-heading hover:text-text-heading hover:no-underline"
                >
                  Get an API key &rarr;
                </Link>
                <a
                  href="https://github.com/TextureHQ/commongrid#api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium leading-none border transition-all duration-150 no-underline cursor-pointer bg-transparent text-[#a89f90] border-transparent hover:border-text-heading hover:text-text-heading hover:no-underline"
                >
                  Read the docs
                </a>
              </div>
            </div>

            <div className="p-6.5 bg-background-surface border-l border-border-default md:border-l-0 md:border-t">
              <div className="font-[family-name:var(--font-fira-code)] text-[11px] text-text-caption mb-3.5 flex items-center gap-2">
                Core endpoints · v1
              </div>
              {ENDPOINT_DEFS.map((ep) => {
                const desc = ep.desc ?? (ep.countKey ? `${dynamicCounts[ep.countKey]} ${ep.suffix}` : "");
                return (
                  <div
                    key={ep.path}
                    className="grid grid-cols-[48px_1fr_auto] gap-3 py-2.5 border-b border-dashed border-border-muted items-center text-[13px] last:border-b-0"
                  >
                    <span className="font-[family-name:var(--font-fira-code)] text-[10px] py-0.5 px-1.5 rounded-sm bg-feedback-success-background text-feedback-success-text font-semibold text-center tracking-[.04em]">
                      {ep.path === "/tiles/{layer}/{z}/{x}/{y}" ? "MVT" : "GET"}
                    </span>
                    <span className="font-[family-name:var(--font-fira-code)] text-[13px] text-text-heading">
                      {ep.path}
                    </span>
                    <span className="text-text-muted text-xs text-right">{desc}</span>
                  </div>
                );
              })}
              <div className="grid grid-cols-[48px_1fr_auto] gap-3 py-2.5 items-center text-[13px]">
                <span className="font-[family-name:var(--font-fira-code)] text-[10px] py-0.5 px-1.5 rounded-sm bg-feedback-success-background text-feedback-success-text font-semibold text-center tracking-[.04em]">
                  MVT
                </span>
                <span className="font-[family-name:var(--font-fira-code)] text-[13px] text-text-heading">
                  /tiles/&#123;layer&#125;/&#123;z&#125;/&#123;x&#125;/&#123;y&#125;
                </span>
                <span className="text-text-muted text-xs text-right">vector tiles</span>
              </div>

              <div className="mt-5 pt-4 border-t border-dashed border-border-muted flex justify-between items-center text-xs text-text-muted font-[family-name:var(--font-fira-code)]">
                <span>Weekly snapshot · .sql.gz + .geojson layers</span>
                <Link href="/snapshots" className="text-brand-primary no-underline hover:underline">
                  Download &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border-default py-12 pb-8 mt-5">
        <div className="max-w-[1280px] mx-auto px-[clamp(20px,4vw,56px)]">
          <div className="grid lg:grid-cols-[2fr_1fr_1fr_1fr] md:grid-cols-3 sm:grid-cols-2 gap-8 md:gap-y-8 md:gap-x-6 sm:gap-y-7 sm:gap-x-4">
            <div className="lg:col-span-1 md:col-span-3 sm:col-span-2">
              <Link
                href="/"
                className="inline-flex items-center flex-nowrap whitespace-nowrap gap-3.5 font-[family-name:var(--font-rethink-sans)] font-bold text-[28px] tracking-[-0.025em] leading-none text-text-heading no-underline"
              >
                <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="w-8 h-8 shrink-0">
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
              <p className="text-sm text-text-muted leading-relaxed max-w-[38ch] lg:max-w-[38ch] md:max-w-[60ch] mt-3 mb-0">
                A public registry of U.S. energy infrastructure, maintained by its users. Released into the commons
                under ODbL 1.0.
              </p>
              <div className="inline-flex items-center gap-2 text-xs text-text-caption mt-3.5">
                <span>Incubated & backed by</span>
                <span className="text-text-heading font-medium">Texture</span>
              </div>
            </div>
            <div>
              <h5 className="font-[family-name:var(--font-fira-code)] text-xs text-text-muted m-0 mb-4 font-medium">
                The data
              </h5>
              {[
                { href: "/grid-operators", label: "Utilities" },
                { href: "/explore", label: "Territories" },
                { href: "/grid-operators", label: "Operators" },
                { href: "/power-plants", label: "Power plants" },
                { href: "/substations", label: "Substations" },
                { href: "/ev-charging", label: "EV charging" },
                { href: "/changelog", label: "Full changelog" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-text-muted py-1 no-underline transition-colors duration-150 hover:text-text-heading"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div>
              <h5 className="font-[family-name:var(--font-fira-code)] text-xs text-text-muted m-0 mb-4 font-medium">
                Build with it
              </h5>
              {[
                { href: "/developers", label: "REST API" },
                { href: "/developers", label: "Vector tiles" },
                { href: "/snapshots", label: "Weekly snapshots" },
                { href: "/developers", label: "API keys" },
                { href: "https://github.com/TextureHQ/commongrid", label: "GitHub", external: true },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  {...(link.external && { target: "_blank", rel: "noopener noreferrer" })}
                  className="block text-sm text-text-muted py-1 no-underline transition-colors duration-150 hover:text-text-heading"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div>
              <h5 className="font-[family-name:var(--font-fira-code)] text-xs text-text-muted m-0 mb-4 font-medium">
                The project
              </h5>
              {[
                { href: "/about", label: "About" },
                { href: "/about", label: "Governance" },
                { href: "/contributions", label: "Contributors" },
                { href: "/contributions", label: "Moderation" },
                { href: "https://github.com/TextureHQ/commongrid", label: "Code of conduct", external: true },
              ].map((link) => (
                <a
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  {...(link.external && { target: "_blank", rel: "noopener noreferrer" })}
                  className="block text-sm text-text-muted py-1 no-underline transition-colors duration-150 hover:text-text-heading"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="flex sm:flex-col sm:items-start items-center justify-between mt-10 pt-5 border-t border-border-default text-xs text-text-caption gap-4 sm:gap-1 flex-wrap">
            <span>
              &copy; 2026 · Released under{" "}
              <a
                href="https://opendatacommons.org/licenses/odbl/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted no-underline hover:text-text-heading"
              >
                Open Database License 1.0
              </a>{" "}
              · No trackers, no ads
            </span>
            <span className="font-[family-name:var(--font-fira-code)] tabular-nums">
              rev 7a2f19 · deployed 14:32 UTC
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
