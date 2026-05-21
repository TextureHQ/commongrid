"use client";

import { Skeleton } from "@texturehq/edges";
import Link from "next/link";
import { formatCount, useEntityCounts } from "@/hooks/useEntityCounts";
import "./homepage.css";

/**
 * Inline number with a Skeleton fallback while the count is loading.
 * Sized to match the `.stat-n` typography (32px / tabular numerals).
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
  {
    num: "09",
    cat: "Infrastructure",
    href: "/substations",
    name: "Substations",
    desc: "Step-up, step-down, and switching substations \u2014 voltage class, owner, and interconnected assets normalized from OpenStreetMap.",
    countKey: "substations" as const,
    tags: ["OSM", "\u226569 kV"],
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
  { path: "/substations", countKey: "substations" as const, suffix: "substations" },
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
    substations: formatCount(counts.substations),
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
                A public, citable database of every U.S. electric utility, territory, ISO, market node, and major asset.
                Free to read, edit, cite, and build on.
              </p>
            </div>

            <Link href="/explore" className="hero-visual" aria-label="Explore the registry on the interactive map">
              <div className="map-frame">
                <picture>
                  <source srcSet="/hero-map-preview@2x.webp" type="image/webp" />
                  <img
                    src="/hero-map-preview@2x.png"
                    alt="A preview of the CommonGrid interactive map, centered on Colorado, showing utility service territories, ISO/RTO boundaries, and transmission lines."
                    width={740}
                    height={448}
                    loading="eager"
                    decoding="async"
                  />
                </picture>
                <span className="map-cta btn btn-primary btn-lg">
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
          <ul className="stats" aria-label="Registry contents">
            <li className="stat">
              <span className="stat-n">
                <StatNumber value={counts.utilities} width={72} />
              </span>
              <span className="stat-l">Utilities</span>
            </li>
            <li className="stat">
              <span className="stat-n">
                <StatNumber value={gridOperatorCount} width={44} />
              </span>
              <span className="stat-l">Grid operators</span>
            </li>
            <li className="stat">
              <span className="stat-n">
                <StatNumber value={counts.powerPlants} width={88} />
              </span>
              <span className="stat-l">Power plants</span>
            </li>
            <li className="stat">
              <span className="stat-n">
                <StatNumber value={counts.transmissionLines} width={92} />
              </span>
              <span className="stat-l">Transmission lines</span>
            </li>
            <li className="stat">
              <span className="stat-n">
                <StatNumber value={counts.evStations} width={96} />
              </span>
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
              <h2 className="section-title">Nine entry points, one connected graph.</h2>
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
                        background: "color-mix(in srgb, var(--color-brand-primary) 12%, transparent)",
                        color: "var(--color-brand-dark)",
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
                  style={{
                    background: "var(--color-text-heading)",
                    color: "var(--color-background-body)",
                    borderColor: "var(--color-text-heading)",
                  }}
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
            <div className="foot-col foot-brand">
              <Link href="/" className="foot-brand-link">
                <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
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
              <Link href="/substations">Substations</Link>
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
