"use client";

import { Card } from "@texturehq/edges";
import Link from "next/link";
import { getAllUtilities, getAllIsos, getAllRtos, getAllBalancingAuthorities, getAllPrograms } from "@/lib/data";

export default function LandingPage() {
  const utilityCount = getAllUtilities().length;
  const isoCount = getAllIsos().length;
  const rtoCount = getAllRtos().length;
  const baCount = getAllBalancingAuthorities().length;
  const programCount = getAllPrograms().length;
  // Power plant count is hardcoded to avoid importing the 8.7 MB JSON
  // into the pre-rendered page. Updated by sync-power-plants script.
  const powerPlantCount = 15082;

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <section className="px-6 pt-16 pb-12 sm:pt-24 sm:pb-16 max-w-3xl mx-auto text-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" className="h-16 w-16 mx-auto text-text-heading opacity-80 mb-6">
          <circle cx="10" cy="10" r="3.5"/><circle cx="25" cy="10" r="3.5"/><circle cx="40" cy="10" r="3.5"/><circle cx="55" cy="10" r="3.5"/><circle cx="70" cy="10" r="3.5"/><circle cx="85" cy="10" r="3.5"/>
          <circle cx="10" cy="90" r="3.5"/><circle cx="25" cy="90" r="3.5"/><circle cx="40" cy="90" r="3.5"/><circle cx="55" cy="90" r="3.5"/><circle cx="70" cy="90" r="3.5"/><circle cx="85" cy="90" r="3.5"/>
          <circle cx="10" cy="26" r="3.5"/><circle cx="10" cy="42" r="3.5"/><circle cx="10" cy="58" r="3.5"/><circle cx="10" cy="74" r="3.5"/>
          <circle cx="85" cy="26" r="3.5"/><circle cx="85" cy="42" r="3.5"/><circle cx="85" cy="58" r="3.5"/><circle cx="85" cy="74" r="3.5"/>
          <rect x="28" y="28" width="8" height="44" rx="2"/><rect x="28" y="64" width="30" height="8" rx="2"/><rect x="58" y="28" width="8" height="44" rx="2"/><rect x="44" y="28" width="22" height="8" rx="2"/>
        </svg>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-text-heading tracking-tight mb-4">
          OpenGrid
        </h1>
        <p className="text-base sm:text-lg text-text-muted leading-relaxed max-w-xl mx-auto mb-8">
          The open-source energy infrastructure dataset. Explore utility service territories,
          grid operators, and energy data across the United States.
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-brand-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Explore the Grid
        </Link>
      </section>

      {/* Stats */}
      <section className="px-6 pb-12 sm:pb-16 max-w-3xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Utilities", value: utilityCount.toLocaleString() },
            { label: "Territories", value: "3,000+" },
            { label: "ISOs & RTOs", value: `${isoCount + rtoCount}` },
            { label: "Balancing Authorities", value: `${baCount}` },
            { label: "Power Plants", value: powerPlantCount.toLocaleString() },
            { label: "Programs", value: programCount.toLocaleString() },
          ].map((stat) => (
            <Card key={stat.label} variant="outlined">
              <Card.Content className="text-center py-4">
                <div className="text-2xl font-bold text-text-heading">{stat.value}</div>
                <div className="text-xs text-text-muted mt-1">{stat.label}</div>
              </Card.Content>
            </Card>
          ))}
        </div>
      </section>

      {/* Browse sections */}
      <section className="px-6 pb-16 sm:pb-24 max-w-3xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/explore?view=utilities" className="block group">
            <Card variant="outlined" className="group-hover:border-brand-primary transition-colors h-full">
              <Card.Content className="py-6">
                <div className="text-lg font-semibold text-text-heading mb-1">Utilities</div>
                <p className="text-sm text-text-muted mb-3">
                  Browse {utilityCount.toLocaleString()} electric utilities — investor-owned, co-ops,
                  municipal, and more — with service territory boundaries.
                </p>
                <span className="text-sm font-medium text-brand-primary">
                  Browse utilities &rarr;
                </span>
              </Card.Content>
            </Card>
          </Link>

          <Link href="/explore?view=grid-operators" className="block group">
            <Card variant="outlined" className="group-hover:border-brand-primary transition-colors h-full">
              <Card.Content className="py-6">
                <div className="text-lg font-semibold text-text-heading mb-1">Grid Operators</div>
                <p className="text-sm text-text-muted mb-3">
                  Explore {isoCount} ISOs, {rtoCount} RTOs, and {baCount} Balancing Authorities
                  that manage the electric grid.
                </p>
                <span className="text-sm font-medium text-brand-primary">
                  Browse grid operators &rarr;
                </span>
              </Card.Content>
            </Card>
          </Link>

          <Link href="/power-plants" className="block group">
            <Card variant="outlined" className="group-hover:border-brand-primary transition-colors h-full">
              <Card.Content className="py-6">
                <div className="text-lg font-semibold text-text-heading mb-1">Power Plants</div>
                <p className="text-sm text-text-muted mb-3">
                  Explore {powerPlantCount.toLocaleString()} power plants across the US — solar, wind,
                  nuclear, natural gas, and more from the EIA-860 dataset.
                </p>
                <span className="text-sm font-medium text-brand-primary">
                  Browse power plants &rarr;
                </span>
              </Card.Content>
            </Card>
          </Link>

          <Link href="/explore?view=programs" className="block group">
            <Card variant="outlined" className="group-hover:border-brand-primary transition-colors h-full">
              <Card.Content className="py-6">
                <div className="text-lg font-semibold text-text-heading mb-1">Programs</div>
                <p className="text-sm text-text-muted mb-3">
                  Explore {programCount} energy programs — demand response, EV charging, smart thermostats, and more.
                </p>
                <span className="text-sm font-medium text-brand-primary">
                  Browse programs &rarr;
                </span>
              </Card.Content>
            </Card>
          </Link>

        </div>
      </section>
    </div>
  );
}
