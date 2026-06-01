"use client";

import { Button, Icon } from "@texturehq/edges";
import Link from "next/link";
import "./about.css";

const DATA_SOURCES = [
  {
    name: "EIA-860",
    desc: "Annual Electric Generator Report — power plants, generator details, fuel types, capacity data",
  },
  {
    name: "EIA-861",
    desc: "Annual Electric Power Industry report — utility ownership, customers, sales, revenue data",
  },
  {
    name: "HIFLD",
    desc: "Homeland Infrastructure Foundation — electric utility boundaries, 52,000+ transmission lines",
  },
  {
    name: "DOE AFDC",
    desc: "Alternative Fuels Data Center — 85,000+ EV charging stations, network, connector, access data",
  },
  {
    name: "CAISO / ERCOT / MISO / SPP / PJM / ISO-NE / NYISO",
    desc: "ISO/RTO open data systems — pricing nodes, market participants, interconnection queues",
  },
  { name: "FERC", desc: "Federal Energy Regulatory Commission — ISO/RTO boundaries and wholesale market data" },
  {
    name: "State PUC Records",
    desc: "State Public Utility Commission filings — rate structures and regulatory data",
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
  return (
    <div className="cg-about">
      {/* ── Hero ── */}
      <header className="cg-about-hero">
        <div className="cg-about-hero-inner">
          <div className="cg-about-hero-copy">
            <span className="cg-about-eyebrow">
              <span className="cg-about-eyebrow-dot" aria-hidden />
              About
            </span>
            <h1>A registry of U.S. energy infrastructure.</h1>
            <p className="cg-about-hero-dek">
              CommonGrid is a public, citable, community-maintained registry of utilities, territories, grid operators,
              programs, rates, and assets. Free to read, download, cite, and build on.
            </p>
          </div>
        </div>
      </header>

      {/* ── Article body ── */}
      <section className="cg-about-body">
        <div className="cg-about-body-inner">
          <article className="cg-article">
            <h2>Energy data is public. Finding it shouldn&rsquo;t be a career.</h2>
            <p>
              Utility territories are buried in PDFs. Rate structures are scattered across regulatory filings. Grid
              operator boundaries shift without notice. Service territory maps live in state PUC filing systems that
              require case-by-case requests. Primary identifiers vary by source.
            </p>
            <p>
              Anyone building software, research, or policy analysis that touches energy infrastructure hits the same
              fragmented landscape. The data exists—it just hasn&rsquo;t been assembled, normalized, and kept current in
              one place.
            </p>

            <h2>A connected graph, not a collection of spreadsheets.</h2>
            <p>
              CommonGrid structures data around entities and their relationships, not flat datasets. A utility links to
              its service territory. A territory links to its grid operator. A program links to the utilities offering
              it. A rate links to the territory it applies in. Every entity is a node in the same connected graph.
            </p>
            <p>
              You can start anywhere—a zip code, a co-op name, an ISO—and navigate outward to everything related. No
              manual joins. No spreadsheet archaeology.
            </p>

            <h2>Built by Texture. Opened to everyone.</h2>
            <p>
              <a href="https://texturehq.com" target="_blank" rel="noopener noreferrer">
                Texture
              </a>
              , an energy software company, created CommonGrid. While building our platform, we spent years normalizing
              data from EIA, FERC, HIFLD, NOAA, state PUC filings, and hundreds of other sources. The result: a
              structured, relational model of the U.S. energy landscape.
            </p>
            <p>
              We decided to open it. Not because we had to (the underlying sources are public), but because the
              normalization work is tedious and repetitive. Doing it once for the whole industry makes more sense than
              having every team repeat it.
            </p>
            <p>
              Texture&rsquo;s competitive edge comes from combining this context with real operational data: device
              telemetry, customer accounts, control systems. That layer stays proprietary. The registry—what every
              energy software team needs—is the commons.
            </p>

            <h2>Open, transparent, community-maintained.</h2>
            <p>
              CommonGrid runs on an open contribution model. Anyone can view and download the data. Editing requires an
              account. Version history is public. Anyone can propose a change. Every change is attributable, reviewable,
              and reversible.
            </p>
            <dl className="cg-article-defs">
              {CONTRIBUTION_ROLES.map((role) => (
                <div key={role.term} className="cg-article-def">
                  <dt>{role.term}</dt>
                  <dd>{role.desc}</dd>
                </div>
              ))}
            </dl>

            <h2>Propose, review, merge—not edit and ship.</h2>
            <p>
              Energy data errors can be costly and hard to detect. A wrong territory boundary, an outdated rate
              schedule, or a misclassified ISO assignment can break downstream systems. CommonGrid uses a changeset
              model: edits are proposed as versioned diffs, reviewed by moderators or trusted editors, and merged into
              the canonical dataset only after approval.
            </p>
            <div className="cg-article-steps">
              {HOW_STEPS.map((step) => (
                <div key={step.num} className="cg-article-step">
                  <div className="cg-article-step-num">{step.num}</div>
                  <div>
                    <h4>{step.title}</h4>
                    <p>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <h2>Seeded from authoritative public records.</h2>
            <p>
              We seed CommonGrid from government and regulatory sources, then maintain it through community
              contributions. Every field traces back to a citable origin.
            </p>
            <dl className="cg-article-defs">
              {DATA_SOURCES.map((source) => (
                <div key={source.name} className="cg-article-def">
                  <dt>{source.name}</dt>
                  <dd>{source.desc}</dd>
                </div>
              ))}
            </dl>

            <h2>Open Database License (ODbL).</h2>
            <p>
              CommonGrid uses the{" "}
              <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noopener noreferrer">
                Open Database License (ODbL)
              </a>
              . You can freely use, modify, and redistribute the data. If you publicly distribute a derivative database,
              you must credit CommonGrid and share it under the same terms. This keeps the commons from being absorbed
              into closed products.
            </p>
            <div className="cg-article-resource-grid">
              <a
                href="https://opendatacommons.org/licenses/odbl/"
                target="_blank"
                rel="noopener noreferrer"
                className="cg-resource-card"
              >
                <div className="cg-resource-eyebrow">
                  <Icon name="Article" size={14} />
                  <span>License</span>
                </div>
                <div className="cg-resource-title">Open Database License (ODbL)</div>
                <p className="cg-resource-caption">Full legal text and attribution rules.</p>
                <span className="cg-resource-arrow" aria-hidden>
                  <Icon name="ArrowRight" size={16} />
                </span>
              </a>
              <a
                href="https://github.com/TextureHQ/commongrid"
                target="_blank"
                rel="noopener noreferrer"
                className="cg-resource-card"
              >
                <div className="cg-resource-eyebrow">
                  <Icon name="GithubLogo" size={14} />
                  <span>Source</span>
                </div>
                <div className="cg-resource-title">GitHub repository</div>
                <p className="cg-resource-caption">Issues, PRs, schema, and contribution guide.</p>
                <span className="cg-resource-arrow" aria-hidden>
                  <Icon name="ArrowRight" size={16} />
                </span>
              </a>
            </div>
          </article>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section className="cg-about-cta">
        <div className="cg-about-cta-inner">
          <h2>Start exploring.</h2>
          <p>A public registry of U.S. energy infrastructure.</p>
          <div className="cg-about-cta-actions">
            <Link href="/explore">
              <Button variant="primary">Browse the registry</Button>
            </Link>
            <Link href="/auth/signup">
              <Button variant="secondary">Create account</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
