"use client";

import { Badge, Card, PageLayout, Section } from "@texturehq/edges";
import Link from "next/link";

const dataSources = [
  { name: "EIA-860", description: "Annual Electric Generator Report — 15,082 power plants, generator details, fuel types, and capacity data" },
  { name: "EIA-861", description: "Annual electric power industry report — utility ownership, customers, sales, and revenue data" },
  { name: "HIFLD", description: "Homeland Infrastructure Foundation-Level Data — electric service territory boundaries" },
  { name: "CEC", description: "California Energy Commission — CCA territory data and California-specific utility information" },
  { name: "FERC", description: "Federal Energy Regulatory Commission — ISO/RTO boundaries and wholesale market data" },
  { name: "State PUC Records", description: "State Public Utility Commission filings — rate structures and regulatory data" },
];

const dataHighlights = [
  { label: "Grid Operators", value: "3,132", icon: "⚡" },
  { label: "Power Plants", value: "15,082", icon: "🏭" },
  { label: "Grid Infrastructure", value: "ISOs, RTOs, BAs", icon: "🔌" },
  { label: "Territory Boundaries", value: "3,000+ GeoJSON", icon: "🗺️" },
];

export default function AboutPage() {
  return (
    <PageLayout>
      <PageLayout.Header title="About OpenGrid" />
      <PageLayout.Content>
        {/* Hero */}
        <Section id="mission" navLabel="Mission" title="The open-source energy infrastructure dataset" withDivider>
          <Card variant="outlined">
            <Card.Content>
              <div className="space-y-4 text-text-body leading-relaxed">
                <p className="text-lg">
                  <strong className="text-text-heading">OpenGrid</strong> is the open-source energy infrastructure dataset built by{" "}
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
        <Section id="data" navLabel="Data" title="What's in OpenGrid" withDivider>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {dataHighlights.map((item) => (
              <Card key={item.label} variant="outlined">
                <Card.Content>
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <div className="text-sm text-text-muted mb-1">{item.label}</div>
                  <div className="text-lg font-semibold text-text-heading">{item.value}</div>
                </Card.Content>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/grid-operators">
              <Badge size="lg" shape="pill" variant="info">Browse Grid Operators →</Badge>
            </Link>
            <Link href="/power-plants">
              <Badge size="lg" shape="pill" variant="warning">Browse Power Plants →</Badge>
            </Link>
            <Link href="/explore">
              <Badge size="lg" shape="pill" variant="success">Explore Map →</Badge>
            </Link>
            <a href="https://github.com/TextureHQ/opengrid" target="_blank" rel="noopener noreferrer">
              <Badge size="lg" shape="pill" variant="default">View on GitHub →</Badge>
            </a>
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
                  OpenGrid is under active development. We&rsquo;re continuously adding new data sources, improving data quality, and expanding coverage. Contributions are welcome — whether that&rsquo;s reporting data issues, adding new sources, or improving the explorer.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href="https://github.com/TextureHQ/opengrid"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline text-sm font-medium"
                  >
                    GitHub Repository →
                  </a>
                  <a
                    href="https://github.com/TextureHQ/opengrid/issues"
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
