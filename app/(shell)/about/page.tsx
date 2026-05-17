"use client";

import { Skeleton } from "@texturehq/edges";
import Link from "next/link";
import { ContentPage } from "@/components/ContentPage";
import { formatCount, useEntityCounts } from "@/hooks/useEntityCounts";
import "./about.css";

/**
 * Inline number with a Skeleton fallback while the count is loading.
 * Sized to match the `.ab-stat-n` typography (~26–34px clamped).
 */
function AboutStatNumber({ value, width = 88 }: { value: number | null; width?: number | string }) {
  if (value === null) {
    return <Skeleton width={width} height={30} variant="rect" animation="pulse" ariaLabel="Loading metric" />;
  }
  return <>{formatCount(value)}</>;
}

const DATA_SOURCES = [
  {
    name: "EIA-860",
    desc: "Annual Electric Generator Report \u2014 power plants, generator details, fuel types, capacity data",
  },
  {
    name: "EIA-861",
    desc: "Annual Electric Power Industry report \u2014 utility ownership, customers, sales, revenue data",
  },
  {
    name: "HIFLD",
    desc: "Homeland Infrastructure Foundation \u2014 electric utility boundaries, 52,000+ transmission lines",
  },
  {
    name: "DOE AFDC",
    desc: "Alternative Fuels Data Center \u2014 85,000+ EV charging stations, network, connector, access data",
  },
  {
    name: "CAISO / ERCOT / MISO / SPP / PJM / ISO-NE / NYISO",
    desc: "ISO/RTO open data systems \u2014 pricing nodes, market participants, interconnection queues",
  },
  { name: "FERC", desc: "Federal Energy Regulatory Commission \u2014 ISO/RTO boundaries and wholesale market data" },
  {
    name: "State PUC Records",
    desc: "State Public Utility Commission filings \u2014 rate structures and regulatory data",
  },
];

const CONTRIBUTION_ROLES = [
  { term: "Public user", desc: "View data, download exports, browse change history. No account required." },
  { term: "Contributor", desc: "Propose edits, attach sources and rationale, participate in discussion." },
  { term: "Trusted editor", desc: "Review and approve changesets from contributors." },
  { term: "Domain moderator", desc: "Moderate specific utilities, regions, or data classes." },
  { term: "System admin", desc: "Override policies, handle escalations and abuse." },
];

const HOW_STEPS = [
  { num: "01", title: "Find something wrong", desc: "Spot incorrect or missing data while browsing any entity." },
  {
    num: "02",
    title: "Propose a change",
    desc: "Submit a versioned changeset with a diff, source citation, and rationale.",
  },
  { num: "03", title: "Review", desc: "Moderators review for accuracy, sourcing, and consistency with schema." },
  {
    num: "04",
    title: "Merge & publish",
    desc: "Approved changes merge into the canonical dataset. Full history stays visible.",
  },
];

export default function AboutPage() {
  const counts = useEntityCounts();

  const gridOperatorCount =
    counts.isos !== null && counts.rtos !== null && counts.balancingAuthorities !== null
      ? counts.isos + counts.rtos + counts.balancingAuthorities
      : null;

  return (
    <ContentPage className="cg-about">
      <ContentPage.Header
        kicker="Open data commons"
        title="The energy industry's shared infrastructure record."
        subtitle="CommonGrid is a public, citable, community-maintained registry of U.S. energy infrastructure — utilities, territories, grid operators, programs, rates, and assets. Free to read, download, cite, and build on."
      />
      <div className="ab-badges">
        <span className="ab-badge">Active &middot; continuously updated</span>
        <span className="ab-badge">GitHub</span>
        <span className="ab-badge">ODbL License</span>
      </div>
      <ContentPage.Body>
        {/* ── 01 THE PROBLEM ── */}
        <div className="ab-section">
          <div className="ab-kicker">01 &middot; The problem</div>
          <h2 className="ab-section-title">Energy data is public. Finding it shouldn&rsquo;t be a career.</h2>
          <div className="ab-prose">
            <p>
              Utility territories are buried in PDFs. Rate structures are scattered across regulatory filings. Grid
              operator boundaries shift without notice. Service territory maps live in state PUC filing systems that
              require case-by-case requests. Nobody agrees on primary identifiers.
            </p>
            <p>
              Anyone building software, research, or policy analysis that touches energy infrastructure eventually
              confronts the same fragmented landscape. The data exists &mdash; it&rsquo;s just never been assembled,
              normalized, and kept current in one place anyone can use.
            </p>
          </div>
        </div>

        {/* ── 02 WHY COMMONGRID ── */}
        <div className="ab-section">
          <div className="ab-kicker">02 &middot; Why CommonGrid is</div>
          <h2 className="ab-section-title">A connected graph, not a collection of spreadsheets.</h2>
          <div className="ab-prose">
            <p>
              CommonGrid is structured around entities and their relationships &mdash; not flat datasets. A utility
              links to its service territory. A territory links to its grid operator. A program links to the utilities
              offering it. A rate links to the territory it applies in. Every entity is a node in the same connected
              graph.
            </p>
            <p>
              That structure means you can start anywhere &mdash; a zip code, a co-op name, an ISO &mdash; and navigate
              outward to everything related. No manual joins. No spreadsheet archaeology.
            </p>
          </div>
          <div className="ab-stats">
            <div className="ab-stat">
              <div className="ab-stat-n">
                <AboutStatNumber value={counts.utilities} width={72} />
              </div>
              <div className="ab-stat-l">Utilities</div>
            </div>
            <div className="ab-stat">
              <div className="ab-stat-n">
                <AboutStatNumber value={gridOperatorCount} width={44} />
              </div>
              <div className="ab-stat-l">Grid operators</div>
            </div>
            <div className="ab-stat">
              <div className="ab-stat-n">
                <AboutStatNumber value={counts.territories} width={72} />
              </div>
              <div className="ab-stat-l">Territories</div>
            </div>
            <div className="ab-stat">
              <div className="ab-stat-n">
                <AboutStatNumber value={counts.powerPlants} width={80} />
              </div>
              <div className="ab-stat-l">Power plants</div>
            </div>
            <div className="ab-stat">
              <div className="ab-stat-n">
                <AboutStatNumber value={counts.programs} width={56} />
              </div>
              <div className="ab-stat-l">Programs</div>
            </div>
            <div className="ab-stat">
              <div className="ab-stat-n">
                <AboutStatNumber value={counts.evStations} width={88} />
              </div>
              <div className="ab-stat-l">EV stations</div>
            </div>
          </div>
        </div>

        {/* ── 03 ORIGIN ── */}
        <div className="ab-section">
          <div className="ab-kicker">03 &middot; Origin</div>
          <h2 className="ab-section-title">Built by Texture. Opened to everyone.</h2>
          <div className="ab-prose">
            <p>
              CommonGrid was created by{" "}
              <a
                href="https://texturehq.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-heading underline"
              >
                Texture
              </a>
              , an energy software company. In building our platform, we spent years normalizing data from EIA, FERC,
              HIFLD, NOAA, state PUC filings, and hundreds of other sources. The result was a structured, relational
              model of the U.S. energy landscape.
            </p>
            <p>
              We decided to open it. Not because we had to &mdash; the underlying sources are public &mdash; but because
              the normalization work is genuinely unglamorous, and doing it once for the whole industry makes more sense
              than having every team do it independently.
            </p>
            <p>
              Texture&rsquo;s competitive advantages live in what happens when this context combines with real
              operational data: device telemetry, customer accounts, control systems. That layer stays proprietary. The
              registry layer &mdash; what every energy software team needs to function &mdash; is the commons.
            </p>
          </div>
        </div>

        {/* ── 04 CONTRIBUTION MODEL ── */}
        <div className="ab-section">
          <div className="ab-kicker">04 &middot; Contribution model</div>
          <h2 className="ab-section-title">Open, transparent, community-maintained.</h2>
          <div className="ab-prose" style={{ marginBottom: 20 }}>
            <p>
              CommonGrid uses an open contribution model: anyone can view and download the data, account-based editing,
              transparent version history, and community governance. Anyone can propose a change. Every change is
              attributable, reviewable, and reversible.
            </p>
          </div>
          <dl className="ab-defs">
            {CONTRIBUTION_ROLES.map((role) => (
              <div key={role.term} className="ab-def">
                <dt>{role.term}</dt>
                <dd>{role.desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── 05 HOW CHANGES WORK ── */}
        <div className="ab-section">
          <div className="ab-kicker">05 &middot; How changes work</div>
          <h2 className="ab-section-title">Propose, review, merge &mdash; not edit and ship.</h2>
          <div className="ab-prose" style={{ marginBottom: 20 }}>
            <p>
              Energy data errors can be costly and hard to detect. A wrong territory boundary, an outdated rate
              schedule, a misclassified ISO assignment &mdash; these aren&rsquo;t typos. So CommonGrid uses a changeset
              model: edits are proposed as versioned diffs, reviewed by moderators or trusted editors, and merged into
              the canonical dataset only when approved.
            </p>
          </div>
          <div className="ab-flow">
            {HOW_STEPS.map((step) => (
              <div key={step.num} className="ab-step">
                <div className="ab-step-num">{step.num}</div>
                <div>
                  <h4>{step.title}</h4>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 06 DATA SOURCES ── */}
        <div className="ab-section">
          <div className="ab-kicker">06 &middot; Data sources</div>
          <h2 className="ab-section-title">Seeded from authoritative public records.</h2>
          <div className="ab-prose" style={{ marginBottom: 20 }}>
            <p>
              CommonGrid is seeded from government and regulatory sources, then maintained by community contributions.
              Every field traces back to a citable origin.
            </p>
          </div>
          <dl className="ab-defs">
            {DATA_SOURCES.map((source) => (
              <div key={source.name} className="ab-def">
                <dt>{source.name}</dt>
                <dd>{source.desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── 07 LICENSE ── */}
        <div className="ab-section">
          <div className="ab-kicker">07 &middot; License</div>
          <h2 className="ab-section-title">Open Database License (ODbL).</h2>
          <div className="ab-prose">
            <p>
              CommonGrid is published under the{" "}
              <a
                href="https://opendatacommons.org/licenses/odbl/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-heading underline"
              >
                Open Database License (ODbL)
              </a>
              . You can freely use, modify, and redistribute the data. If you publicly distribute a derivative database,
              you must attribute CommonGrid and share it under the same terms. This protects the commons from being
              absorbed into closed products.
            </p>
          </div>
          <div className="flex gap-2.5 mt-5 flex-wrap">
            <a
              href="https://opendatacommons.org/licenses/odbl/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium border border-border-default text-text-heading hover:border-text-heading transition-colors no-underline"
            >
              Read the ODbL &nearr;
            </a>
            <a
              href="https://github.com/TextureHQ/commongrid"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium bg-text-heading text-background-body border border-text-heading hover:opacity-90 transition-opacity no-underline"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* ── Footer CTA ── */}
        <div className="ab-cta">
          <h2>Start contributing.</h2>
          <p>
            Something is missing or incorrect? Create an account and propose a change &mdash; every edit is reviewed,
            attributed, and reversible.
          </p>
          <div className="flex gap-2.5 flex-wrap">
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium bg-text-heading text-background-body border border-text-heading hover:opacity-90 transition-opacity no-underline"
            >
              Browse the registry &rarr;
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex items-center h-9 px-4 rounded-lg text-sm font-medium border border-border-default text-text-heading hover:border-text-heading transition-colors no-underline"
            >
              Create account
            </Link>
          </div>
        </div>
      </ContentPage.Body>
    </ContentPage>
  );
}
