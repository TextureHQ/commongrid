"use client";

import { Badge, Card, PageLayout, Section } from "@texturehq/edges";
import Link from "next/link";

const dataSources = [
  { name: "EIA-860", description: "Annual Electric Generator Report — 15,082 power plants, generator details, fuel types, and capacity data" },
  { name: "EIA-861", description: "Annual electric power industry report — utility ownership, customers, sales, and revenue data" },
  { name: "HIFLD", description: "Homeland Infrastructure Foundation-Level Data — electric service territory boundaries and 52,000+ transmission line segments" },
  { name: "DOE AFDC", description: "Alternative Fuels Data Center — 85,000+ US EV charging stations with network, connector, and access data. Updated weekly." },
  { name: "CEC", description: "California Energy Commission — CCA territory data and California-specific utility information" },
  { name: "CAISO OASIS", description: "California ISO Open Access Same-time Information System — pricing node definitions and wholesale market reference data" },
  { name: "ISO/RTO Public Data", description: "Public pricing node, zone, and hub data from CAISO, PJM, ERCOT, MISO, NYISO, ISO-NE, and SPP" },
  { name: "FERC", description: "Federal Energy Regulatory Commission — ISO/RTO boundaries and wholesale market data" },
  { name: "State PUC Records", description: "State Public Utility Commission filings — rate structures and regulatory data" },
];

const dataHighlights = [
  { label: "Utilities", value: "3,000+", icon: "🏢", href: "/grid-operators" },
  { label: "Grid Operators", value: "3,132", icon: "⚡", href: "/grid-operators" },
  { label: "Territory Boundaries", value: "4,841", icon: "🗺️", href: "/explore" },
  { label: "Power Plants", value: "15,082", icon: "🏭", href: "/power-plants" },
  { label: "Transmission Lines", value: "52,000+", icon: "🔌", href: "/transmission-lines" },
  { label: "EV Charging Stations", value: "85,425", icon: "🔋", href: "/ev-charging" },
  { label: "Pricing Nodes", value: "4,065", icon: "💰", href: "/pricing-nodes" },
  { label: "Programs & Incentives", value: "500+", icon: "📋", href: "/explore?view=programs" },
  { label: "Rates & Tariffs", value: "~12k", icon: "📄", href: "/explore?view=rates" },
];

export default function AboutPage() {
  return (
    <PageLayout maxWidth={900}>
      <PageLayout.Header title="About CommonGrid" />
      <PageLayout.Content>
        {/* Hero */}
        <Section id="mission" navLabel="Mission" title="The open-source energy infrastructure dataset" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="space-y-4 text-text-body leading-relaxed">
                <p className="text-lg">
                  <strong className="text-text-heading">CommonGrid</strong> is the open-source energy infrastructure dataset built by{" "}
                  <a href="https://texturehq.com" target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                    Texture
                  </a>
                  . It exists because the data that powers America&rsquo;s energy system shouldn&rsquo;t be this hard to find.
                </p>
                <p>
                  Utility territories are buried in PDFs. Rate structures are scattered across regulatory filings. Grid operator boundaries? Nobody agrees on those. If you&rsquo;ve ever tried to answer a simple question like <em>&ldquo;which utility serves this address?&rdquo;</em> — you know the pain.
                </p>
                <p>
                  Texture spent years pulling data from EIA, NOAA, HIFLD, FERC, and hundreds of public sources to build the most comprehensive energy infrastructure dataset available. Now we&rsquo;re open-sourcing it: browse it, build on it, contribute back.
                </p>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Data at a Glance */}
        <Section id="data" navLabel="Data" title="What's in CommonGrid" withDivider>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
            {dataHighlights.map((item) => (
              <Link key={item.label} href={item.href} className="block group">
                <Card variant="outlined" className="h-full group-hover:border-brand-primary/50 group-hover:shadow-sm transition-all">
                  <Card.Content>
                    <div className="text-2xl mb-2">{item.icon}</div>
                    <div className="text-sm text-text-muted mb-1">{item.label}</div>
                    <div className="text-lg font-semibold text-text-heading mb-3">{item.value}</div>
                    <div className="text-xs text-brand-primary font-medium group-hover:underline">
                      Browse {item.label} →
                    </div>
                  </Card.Content>
                </Card>
              </Link>
            ))}
          </div>
        </Section>

        {/* Data Sources */}
        <Section id="sources" navLabel="Sources" title="Data Sources" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="space-y-4">
                {dataSources.map((source) => (
                  <div key={source.name} className="flex flex-col gap-1">
                    <div className="font-semibold text-text-heading font-mono text-sm">{source.name}</div>
                    <div className="text-text-body text-sm">{source.description}</div>
                  </div>
                ))}
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Contribute */}
        <Section id="contribute" navLabel="Contribute" title="Help Build CommonGrid" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="space-y-4 text-text-body leading-relaxed">
                <p className="text-lg">
                  <strong className="text-text-heading">CommonGrid isn&rsquo;t just our project — it&rsquo;s yours.</strong>
                </p>
                <p>
                  The best open datasets are built by communities. Like OpenStreetMap proved that millions of contributors can map the world better than any single company, we believe the energy industry&rsquo;s data should be just as accessible and community-maintained.
                </p>
                <p>
                  We need your help. Whether you work at a utility, a research lab, a state PUC, or you&rsquo;re just a data nerd who cares about the grid — there&rsquo;s a way to contribute:
                </p>
                <ul className="space-y-2 ml-1">
                  <li className="flex gap-2">
                    <span className="flex-none">📊</span>
                    <span><strong>Submit data corrections</strong> — spot a wrong address, outdated customer count, or missing utility? Open an issue or PR.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-none">🗺️</span>
                    <span><strong>Contribute new data sources</strong> — know of a public dataset we&rsquo;re missing? State-level data, municipal records, international grids? We want it.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-none">🔧</span>
                    <span><strong>Improve the tools</strong> — better sync scripts, new visualizations, data validation — all contributions welcome.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-none">🐛</span>
                    <span><strong>Report issues</strong> — even just flagging that something looks wrong is incredibly valuable.</span>
                  </li>
                </ul>
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href="https://github.com/TextureHQ/commongrid/issues/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Open an Issue →
                  </a>
                  <a
                    href="https://github.com/TextureHQ/commongrid"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-default text-text-body text-sm font-medium hover:border-brand-primary/50 transition-colors"
                  >
                    Fork on GitHub →
                  </a>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>

        {/* Status */}
        <Section id="status" navLabel="Status" title="Status" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="space-y-4 text-text-body leading-relaxed">
                <div className="flex items-center gap-2">
                  <Badge size="sm" shape="pill" variant="warning">Early Access</Badge>
                  <span className="text-text-muted text-sm">Actively growing</span>
                </div>
                <p>
                  CommonGrid is under active development. We&rsquo;re continuously adding new data sources, improving data quality, and expanding coverage. Contributions are welcome — whether that&rsquo;s reporting data issues, adding new sources, or improving the explorer.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href="https://github.com/TextureHQ/commongrid"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline text-sm font-medium"
                  >
                    GitHub Repository →
                  </a>
                  <a
                    href="https://github.com/TextureHQ/commongrid/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline text-sm font-medium"
                  >
                    Report an Issue →
                  </a>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Section>
      </PageLayout.Content>
    </PageLayout>
  );
}
