"use client";

import { Button, Icon, Section } from "@texturehq/edges";
import Link from "next/link";
import { DefinitionList } from "@/components/ui/data";
import { PageHeader, PageShell } from "@/components/ui/layout";
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
    <PageShell className="cg-about">
      <PageHeader
        title="About CommonGrid"
        subtitle="CommonGrid is a public, citable, community-maintained registry of U.S. energy infrastructure — utilities, territories, grid operators, programs, rates, and assets. Free to read, download, cite, and build on."
      />

      {/* THE PROBLEM */}
      <Section title="Energy data is public. Finding it shouldn't be a career.">
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
      </Section>

      {/* WHY COMMONGRID */}
      <Section title="A connected graph, not a collection of spreadsheets.">
        <div className="ab-prose">
          <p>
            CommonGrid is structured around entities and their relationships &mdash; not flat datasets. A utility links
            to its service territory. A territory links to its grid operator. A program links to the utilities offering
            it. A rate links to the territory it applies in. Every entity is a node in the same connected graph.
          </p>
          <p>
            That structure means you can start anywhere &mdash; a zip code, a co-op name, an ISO &mdash; and navigate
            outward to everything related. No manual joins. No spreadsheet archaeology.
          </p>
        </div>
      </Section>

      {/* ORIGIN */}
      <Section title="Built by Texture. Opened to everyone.">
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
            HIFLD, NOAA, state PUC filings, and hundreds of other sources. The result was a structured, relational model
            of the U.S. energy landscape.
          </p>
          <p>
            We decided to open it. Not because we had to &mdash; the underlying sources are public &mdash; but because
            the normalization work is genuinely unglamorous, and doing it once for the whole industry makes more sense
            than having every team do it independently.
          </p>
          <p>
            Texture&rsquo;s competitive advantages live in what happens when this context combines with real operational
            data: device telemetry, customer accounts, control systems. That layer stays proprietary. The registry layer
            &mdash; what every energy software team needs to function &mdash; is the commons.
          </p>
        </div>
      </Section>

      {/* CONTRIBUTION MODEL */}
      <Section title="Open, transparent, community-maintained.">
        <div className="ab-prose mb-5">
          <p>
            CommonGrid uses an open contribution model: anyone can view and download the data, account-based editing,
            transparent version history, and community governance. Anyone can propose a change. Every change is
            attributable, reviewable, and reversible.
          </p>
        </div>
        <DefinitionList
          items={CONTRIBUTION_ROLES.map((role) => ({
            term: role.term,
            description: role.desc,
          }))}
        />
      </Section>

      {/* HOW CHANGES WORK */}
      <Section title="Propose, review, merge — not edit and ship.">
        <div className="ab-prose mb-5">
          <p>
            Energy data errors can be costly and hard to detect. A wrong territory boundary, an outdated rate schedule,
            a misclassified ISO assignment &mdash; these aren&rsquo;t typos. So CommonGrid uses a changeset model: edits
            are proposed as versioned diffs, reviewed by moderators or trusted editors, and merged into the canonical
            dataset only when approved.
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
      </Section>

      {/* DATA SOURCES */}
      <Section title="Seeded from authoritative public records.">
        <div className="ab-prose mb-5">
          <p>
            CommonGrid is seeded from government and regulatory sources, then maintained by community contributions.
            Every field traces back to a citable origin.
          </p>
        </div>
        <DefinitionList
          items={DATA_SOURCES.map((source) => ({
            term: source.name,
            description: source.desc,
          }))}
        />
      </Section>

      {/* LICENSE */}
      <Section title="Open Database License (ODbL).">
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
          <Button
            href="https://opendatacommons.org/licenses/odbl/"
            variant="secondary"
            className="inline-flex items-center gap-1.5"
          >
            Read the ODbL
            <Icon name="ArrowUpRight" size={16} />
          </Button>
          <Button
            href="https://github.com/TextureHQ/commongrid"
            variant="primary"
            className="inline-flex items-center gap-1.5"
          >
            <Icon name="GithubLogo" size={16} />
            View on GitHub
          </Button>
        </div>
      </Section>

      {/* ── Footer CTA ── */}
      <div className="ab-cta">
        <h2>Start exploring.</h2>
        <p>Browse utilities, territories, programs, power plants, and more — or create an account to contribute.</p>
        <div className="flex gap-2.5 flex-wrap">
          <Link href="/explore">
            <Button variant="primary">Browse the registry</Button>
          </Link>
          <Link href="/auth/signup">
            <Button variant="secondary">Create account</Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
