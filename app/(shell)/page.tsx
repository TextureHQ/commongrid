"use client";

import { Button, Card, Icon, TextLink } from "@texturehq/edges";
import Link from "next/link";
import { getAllUtilities, getAllIsos, getAllRtos, getAllBalancingAuthorities, getAllPrograms, getChangelog } from "@/lib/data";
import type { ChangelogEntry } from "@/types/changelog";
import { useGlobalSearch } from "@/components/GlobalSearch";

// Power plant count is hardcoded to avoid importing the 8.7 MB JSON into the pre-rendered page.
// Updated by sync-power-plants script.
const POWER_PLANT_COUNT = 15082;
// Transmission line count is hardcoded for the same reason. Updated by sync-transmission-lines script.
const TRANSMISSION_LINE_COUNT = 52244;
// EV charging station count is hardcoded for the same reason. Updated by sync-ev-charging script.
const EV_STATION_COUNT = 85425;
// Pricing node count — updated by sync-pricing-nodes script.
const pricingNodeCount = 4065;
const RATE_SCHEDULE_COUNT = "~12k";
const TERRITORY_COUNT = 4841;

const ENTITY_CARDS = [
  {
    id: "explore",
    href: "/explore",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500",
    iconName: "MapTrifold" as const,
    title: "Explore by Geography",
    description:
      "Interactive territory map. Click any region to see the utility operating there, its service boundary, and relationships.",
    countKey: "territories" as const,
    countLabel: "territories",
  },
  {
    id: "utilities",
    href: "/grid-operators",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-500",
    iconName: "Buildings" as const,
    title: "Utilities",
    description:
      "All ~3,000 U.S. electric utilities — IOUs, co-ops, municipals, and federal power agencies. Filter by state, segment, and ISO.",
    countKey: "utilities" as const,
    countLabel: "utilities",
  },
  {
    id: "grid-operators",
    href: "/grid-operators",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
    iconName: "Lightning" as const,
    title: "Grid Operators",
    description:
      "ISOs, RTOs, and balancing authorities — the entities that coordinate dispatch, markets, and reliability across regions.",
    countKey: "gridOperators" as const,
    countLabel: "operators",
  },
  {
    id: "programs",
    href: "/explore?view=programs",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-500",
    iconName: "ClipboardText" as const,
    title: "Programs & Incentives",
    description:
      "Demand response, rebates, EV programs, VPP programs — structured and queryable by asset type, segment, and state.",
    countKey: "programs" as const,
    countLabel: "programs",
  },
  {
    id: "rates",
    href: "/explore?view=rates",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-500",
    iconName: "Receipt" as const,
    title: "Rates & Tariffs",
    description:
      "Residential and commercial rate structures filed by utilities. TOU windows, demand charges, and standby rates.",
    countKey: "rates" as const,
    countLabel: "rate schedules",
  },
  {
    id: "power-plants",
    href: "/power-plants",
    iconBg: "bg-teal-50",
    iconColor: "text-teal-500",
    iconName: "Factory" as const,
    title: "Power Plants",
    description:
      "Solar, wind, nuclear, natural gas, and more — EIA Form 860 data normalized and connected to utilities and territories.",
    countKey: "powerPlants" as const,
    countLabel: "plants",
  },
  {
    id: "transmission-lines",
    href: "/transmission-lines",
    iconBg: "bg-sky-50",
    iconColor: "text-sky-500",
    iconName: "CellTower" as const,
    title: "Transmission Lines",
    description:
      "High-voltage transmission infrastructure (69kV–765kV) across the U.S. — HIFLD dataset, spatially queryable.",
    countKey: "transmissionLines" as const,
    countLabel: "lines",
  },
  {
    id: "ev-charging",
    href: "/ev-charging",
    iconBg: "bg-green-50",
    iconColor: "text-green-500",
    iconName: "Lightning" as const,
    title: "EV Charging",
    description:
      "85,000+ EV charging stations across the U.S. from the DOE AFDC — ChargePoint, Tesla, Electrify America, and more.",
    countKey: "evStations" as const,
    countLabel: "stations",
  },
  {
    id: "pricing-nodes",
    href: "/pricing-nodes",
    iconBg: "bg-yellow-50",
    iconColor: "text-yellow-600",
    iconName: "Lightning" as const,
    title: "Pricing Nodes",
    description:
      "Wholesale electricity market nodes — trading hubs, load zones, SUBLAPs, and generation pricing points across 7 ISOs/RTOs.",
    countKey: "pricingNodes" as const,
    countLabel: "nodes",
  },
];

/** Derive a stable avatar color class from entity name initial */
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-600",
  "bg-purple-100 text-purple-600",
  "bg-teal-100 text-teal-600",
  "bg-orange-100 text-orange-600",
  "bg-sky-100 text-sky-600",
  "bg-green-100 text-green-600",
  "bg-rose-100 text-rose-600",
  "bg-amber-100 text-amber-600",
  "bg-indigo-100 text-indigo-600",
  "bg-emerald-100 text-emerald-600",
  "bg-lime-100 text-lime-600",
  "bg-cyan-100 text-cyan-600",
  "bg-violet-100 text-violet-600",
] as const;

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function ActivityRow({ entry }: { entry: ChangelogEntry }) {
  const color = avatarColor(entry.name);
  const initial = entry.name.charAt(0).toUpperCase();
  const time = formatRelativeTime(entry.isoTimestamp);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border-default last:border-0">
      <div
        className={`flex-none w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${color}`}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-heading truncate">{entry.name}</div>
        <div className="text-xs text-text-muted truncate">{entry.detail}</div>
      </div>
      <div className="flex-none text-xs text-text-muted tabular-nums">{time}</div>
    </div>
  );
}

export default function LandingPage() {
  const { open: openSearch } = useGlobalSearch();
  const utilityCount = getAllUtilities().length;
  const isoCount = getAllIsos().length;
  const rtoCount = getAllRtos().length;
  const baCount = getAllBalancingAuthorities().length;
  const programCount = getAllPrograms().length;
  const gridOperatorCount = isoCount + rtoCount + baCount;
  const changelog = getChangelog();

  const counts: Record<string, string> = {
    territories: TERRITORY_COUNT.toLocaleString(),
    utilities: utilityCount.toLocaleString(),
    gridOperators: gridOperatorCount.toLocaleString(),
    programs: programCount.toLocaleString(),
    rates: RATE_SCHEDULE_COUNT,
    powerPlants: POWER_PLANT_COUNT.toLocaleString(),
    transmissionLines: TRANSMISSION_LINE_COUNT.toLocaleString(),
    evStations: EV_STATION_COUNT.toLocaleString(),
    pricingNodes: pricingNodeCount.toLocaleString(),
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-background-subtle)]">

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-14 sm:pt-20 sm:pb-16 text-center">
        <div className="max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background-surface border border-border-default text-xs font-medium tracking-widest uppercase text-text-muted mb-8 shadow-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            Open Data Project · Updated Daily
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-heading leading-tight mb-5">
            The open registry of{" "}
            <span className="text-brand-primary">U.S. energy infrastructure</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-text-muted leading-relaxed max-w-xl mx-auto mb-8">
            Structured, normalized, and spatially-aware data on utilities, grid operators,
            territories, programs, and rates — free to browse, download, and build on.
          </p>

          {/* Search */}
          <div className="max-w-lg mx-auto mb-7">
            <button
              type="button"
              onClick={openSearch}
              className="w-full flex items-center gap-3 px-4 h-12 rounded-xl border border-border-default bg-background-surface shadow-sm hover:border-brand-primary/50 hover:shadow-md transition-all cursor-text text-left"
            >
              <Icon name="MagnifyingGlass" size={18} className="text-text-muted flex-none" />
              <span className="flex-1 text-sm text-text-muted">
                Search utilities, programs, ISOs, territories...
              </span>
              <kbd className="flex-none hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border-default bg-[var(--color-background-subtle)] text-text-muted text-xs font-mono">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Button variant="primary" href="/explore" icon="ArrowRight" iconPosition="right">
              Browse the registry
            </Button>
            <Button variant="secondary" href="https://opengrid.texture.energy/api" target="_blank" rel="noopener noreferrer">
              View API docs
            </Button>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────── */}
      <div className="px-6 -mt-0.5">
        <div className="max-w-2xl mx-auto">
          <div className="bg-background-surface border border-border-default rounded-xl shadow-sm py-5 px-6 -mt-px">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-2 items-start">
              {[
                { value: utilityCount.toLocaleString(), label: "Utilities" },
                { value: gridOperatorCount.toLocaleString(), label: "Grid Operators" },
                { value: TERRITORY_COUNT.toLocaleString(), label: "Territories" },
                { value: programCount.toLocaleString(), label: "Programs" },
              ].map((stat) => (
                <div key={stat.label} className="text-center flex flex-col">
                  <div className="text-xl sm:text-2xl font-bold text-text-heading tabular-nums">
                    {stat.value}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted mt-0.5 whitespace-nowrap">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-border-default sm:hidden">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-green-600">Live · Updated Daily</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Browse the Registry ──────────────────────────── */}
      <section className="px-6 py-16 sm:py-20 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-primary mb-2">
            Browse the Registry
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-text-heading mb-2">
            Choose where to start
          </h2>
          <p className="text-base text-text-muted max-w-lg">
            Six entity types, one connected graph. Pick any entry point — they all link back into
            each other.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {ENTITY_CARDS.map((card) => (
            <Link key={card.id} href={card.href} className="block group">
              <Card variant="outlined" className="h-full group-hover:border-brand-primary/50 group-hover:shadow-sm transition-all">
                <Card.Content className="p-6 flex flex-col h-full">
                  {/* Icon */}
                  <div
                    className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${card.iconBg} ${card.iconColor} mb-4 flex-none`}
                  >
                    <Icon name={card.iconName} size={20} />
                  </div>

                  {/* Title */}
                  <div className="text-[15px] font-semibold text-text-heading mb-1.5">
                    {card.title}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-text-muted leading-relaxed flex-1">
                    {card.description}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-default">
                    <span className="text-xs text-text-muted">
                      {counts[card.countKey]} {card.countLabel}
                    </span>
                    <Icon
                      name="ArrowRight"
                      size={16}
                      className="text-text-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all"
                    />
                  </div>
                </Card.Content>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Recent Activity ──────────────────────────────── */}
      <section className="px-6 pb-20 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-primary mb-2">
            Recent Activity
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-text-heading mb-2">
            What's been updated
          </h2>
          <p className="text-base text-text-muted max-w-lg">
            Every update is versioned, attributed, and synced from authoritative sources daily.
          </p>
        </div>

        <Card variant="outlined">
          <Card.Content className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border-default">
              {/* Left: recently updated */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-text-heading">
                    Recently updated entities
                  </span>
                  <TextLink href="/changelog" className="text-xs">
                    View all changes →
                  </TextLink>
                </div>
                <div>
                  {changelog.recentlyUpdated.length > 0 ? (
                    changelog.recentlyUpdated.slice(0, 5).map((entry) => (
                      <ActivityRow key={`${entry.entityType}:${entry.slug}`} entry={entry} />
                    ))
                  ) : (
                    <p className="text-sm text-text-muted py-4">
                      No updates recorded yet. Run{" "}
                      <code className="text-xs bg-background-subtle px-1 py-0.5 rounded">
                        yarn generate:changelog
                      </code>{" "}
                      after a sync to populate this feed.
                    </p>
                  )}
                </div>
              </div>

              {/* Right: newly added */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-text-heading">Newly added</span>
                  <TextLink href="/changelog" className="text-xs">
                    View changelog →
                  </TextLink>
                </div>
                <div>
                  {changelog.newlyAdded.length > 0 ? (
                    changelog.newlyAdded.slice(0, 5).map((entry) => (
                      <ActivityRow key={`${entry.entityType}:${entry.slug}`} entry={entry} />
                    ))
                  ) : (
                    <p className="text-sm text-text-muted py-4">No new entities added yet.</p>
                  )}
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border-default px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col gap-3 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>OpenGrid by Texture, Inc. · ODbL License</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-green-600 font-medium">Live</span>
            </span>
          </div>
          <div className="flex items-center flex-wrap gap-x-5 gap-y-2">
            {[
              { label: "GitHub", href: "https://github.com/TextureHQ/opengrid" },
              { label: "API docs", href: "https://opengrid.texture.energy/api" },
              { label: "About", href: "/about" },
              { label: "License", href: "https://opendatacommons.org/licenses/odbl/" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="hover:text-text-body transition-colors"
                target={link.href.startsWith("http") ? "_blank" : undefined}
                rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
