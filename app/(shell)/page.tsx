"use client";

import { Button, Card, Icon, TextLink } from "@texturehq/edges";
import Link from "next/link";
import { getAllUtilities, getAllIsos, getAllRtos, getAllBalancingAuthorities, getAllPrograms } from "@/lib/data";

// Power plant count is hardcoded to avoid importing the 8.7 MB JSON into the pre-rendered page.
const POWER_PLANT_COUNT = 15082;
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
    id: "infrastructure",
    href: "/power-plants",
    iconBg: "bg-teal-50",
    iconColor: "text-teal-500",
    iconName: "Factory" as const,
    title: "Infrastructure & Assets",
    description:
      "Generation plants, substations, and transmission infrastructure. EIA Form 860 data, normalized and connected.",
    countKey: "powerPlants" as const,
    countLabel: "facilities",
  },
];

const RECENT_UPDATES = [
  {
    name: "Pacific Gas & Electric",
    detail: "Service territory geometry updated · Utility",
    time: "2h ago",
    color: "bg-orange-100 text-orange-600",
    initial: "P",
  },
  {
    name: "CAISO",
    detail: "Member utility list refreshed · Grid Operator",
    time: "5h ago",
    color: "bg-purple-100 text-purple-600",
    initial: "C",
  },
  {
    name: "Xcel Energy — Colorado",
    detail: "Peak demand figure updated (EIA 861) · Utility",
    time: "1d ago",
    color: "bg-blue-100 text-blue-600",
    initial: "X",
  },
  {
    name: "Tennessee Valley Authority",
    detail: "Operating segment corrected · Utility",
    time: "2d ago",
    color: "bg-teal-100 text-teal-600",
    initial: "T",
  },
  {
    name: "PJM Interconnection",
    detail: "Territory polygon updated · Grid Operator",
    time: "3d ago",
    color: "bg-sky-100 text-sky-600",
    initial: "P",
  },
];

const NEWLY_ADDED = [
  {
    name: "Flathead Electric Co-op",
    detail: "Montana distribution co-op added · Utility",
    time: "1d ago",
    color: "bg-green-100 text-green-600",
    initial: "F",
  },
  {
    name: "Rappahannock Electric Co-op",
    detail: "Virginia distribution co-op added · Utility",
    time: "2d ago",
    color: "bg-emerald-100 text-emerald-600",
    initial: "R",
  },
  {
    name: "Basin Electric Power Co-op",
    detail: "G&T co-op, 141 member utilities · Grid Op",
    time: "3d ago",
    color: "bg-lime-100 text-lime-600",
    initial: "B",
  },
  {
    name: "Puget Sound Energy",
    detail: "Washington IOU — full profile added · Utility",
    time: "4d ago",
    color: "bg-cyan-100 text-cyan-600",
    initial: "P",
  },
  {
    name: "Holy Cross Energy",
    detail: "Colorado mountain co-op added · Utility",
    time: "5d ago",
    color: "bg-violet-100 text-violet-600",
    initial: "H",
  },
];

function ActivityRow({
  name,
  detail,
  time,
  color,
  initial,
}: {
  name: string;
  detail: string;
  time: string;
  color: string;
  initial: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border-default last:border-0">
      <div
        className={`flex-none w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${color}`}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-heading truncate">{name}</div>
        <div className="text-xs text-text-muted truncate">{detail}</div>
      </div>
      <div className="flex-none text-xs text-text-muted tabular-nums">{time}</div>
    </div>
  );
}

export default function LandingPage() {
  const utilityCount = getAllUtilities().length;
  const isoCount = getAllIsos().length;
  const rtoCount = getAllRtos().length;
  const baCount = getAllBalancingAuthorities().length;
  const programCount = getAllPrograms().length;
  const gridOperatorCount = isoCount + rtoCount + baCount;

  const counts: Record<string, string> = {
    territories: TERRITORY_COUNT.toLocaleString(),
    utilities: utilityCount.toLocaleString(),
    gridOperators: gridOperatorCount.toLocaleString(),
    programs: programCount.toLocaleString(),
    rates: RATE_SCHEDULE_COUNT,
    powerPlants: `~${(POWER_PLANT_COUNT / 1000).toFixed(0)}k`,
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
            <div className="flex items-center gap-3 px-4 h-12 rounded-xl border border-border-default bg-background-surface shadow-sm">
              <Icon name="MagnifyingGlass" size={18} className="text-text-muted flex-none" />
              <span className="flex-1 text-sm text-text-muted text-left">
                Search utilities, programs, ISOs, territories...
              </span>
              <kbd className="flex-none hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border-default bg-[var(--color-background-subtle)] text-text-muted text-xs font-mono">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
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
          <div className="bg-background-surface border border-border-default rounded-xl shadow-sm py-5 px-6 flex items-center justify-between gap-4 -mt-px">
            {[
              { value: utilityCount.toLocaleString(), label: "Utilities" },
              { value: gridOperatorCount.toLocaleString(), label: "Grid Operators" },
              { value: TERRITORY_COUNT.toLocaleString(), label: "Territories" },
              { value: programCount.toLocaleString(), label: "Programs" },
            ].map((stat, i) => (
              <div key={stat.label} className="flex-1 text-center">
                {i > 0 && (
                  <div className="absolute left-0 top-1/4 h-1/2 w-px bg-border-default" aria-hidden />
                )}
                <div className="text-xl sm:text-2xl font-bold text-text-heading tabular-nums">
                  {stat.value}
                </div>
                <div className="text-[11px] font-medium uppercase tracking-widest text-text-muted mt-0.5">
                  {stat.label}
                </div>
              </div>
            ))}
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-semibold text-green-600">Live</span>
              </div>
              <div className="text-[11px] font-medium uppercase tracking-widest text-text-muted mt-0.5">
                Updated Daily
              </div>
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
                  <TextLink href="https://github.com/TextureHQ/opengrid" external className="text-xs">
                    View all changes →
                  </TextLink>
                </div>
                <div>
                  {RECENT_UPDATES.map((item) => (
                    <ActivityRow key={item.name} {...item} />
                  ))}
                </div>
              </div>

              {/* Right: newly added */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-text-heading">Newly added</span>
                  <TextLink href="https://github.com/TextureHQ/opengrid" external className="text-xs">
                    View changelog →
                  </TextLink>
                </div>
                <div>
                  {NEWLY_ADDED.map((item) => (
                    <ActivityRow key={item.name} {...item} />
                  ))}
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border-default px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <span>OpenGrid is maintained by Texture, Inc. · Data licensed under ODbL</span>
            <span className="inline-flex items-center gap-1 ml-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-green-600 font-medium">Live</span>
            </span>
          </div>
          <div className="flex items-center gap-5">
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
