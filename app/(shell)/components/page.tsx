"use client";

import { Button, Kpi, KpiGroup, StatList } from "@texturehq/edges";
import { useState } from "react";
import { DefinitionList, PageHeader, PageShell, Section } from "@/components/ui";

/**
 * Component Showcase Page
 *
 * Live examples of all shared UI components with props and usage code.
 */
export default function ComponentsPage() {
  const [showSkeletons, setShowSkeletons] = useState(false);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Components" }]}
        title="Component Library"
        subtitle="Shared UI components built with Tailwind utilities and Edges tokens. All components are responsive, typed with TypeScript, and composable."
        actions={
          <Button variant="secondary" size="sm" onPress={() => setShowSkeletons(!showSkeletons)}>
            {showSkeletons ? "Hide Skeletons" : "Show Skeletons"}
          </Button>
        }
      />

      {/* Layout Components */}
      <Section heading="Layout Components">
        <div className="space-y-8">
          {/* PageShell */}
          <ComponentExample
            name="PageShell"
            description="Max-width container (960px) with responsive padding. Provides consistent layout boundaries."
            usage={`<PageShell>
  <PageHeader title="My Page" />
  <Section>Content here</Section>
</PageShell>`}
          >
            <div className="rounded-lg border border-border-default bg-background-muted p-4">
              <div className="text-center text-sm text-text-muted">
                You're inside a PageShell right now! This entire page uses it.
              </div>
            </div>
          </ComponentExample>

          {/* PageHeader */}
          <ComponentExample
            name="PageHeader"
            description="Flexible header with breadcrumbs, title, subtitle, and actions slot. Stacks responsively on mobile."
            usage={`<PageHeader
  breadcrumbs={[
    { label: "Home", href: "/" },
    { label: "About" }
  ]}
  title="About CommonGrid"
  subtitle="The energy industry's shared infrastructure record."
  actions={<Button>Create Account</Button>}
/>`}
          >
            <div className="rounded-lg border border-border-default bg-background-surface p-6">
              <PageHeader
                breadcrumbs={[
                  { label: "Home", href: "/" },
                  { label: "Utilities", href: "/utilities" },
                  { label: "PG&E" },
                ]}
                title="Pacific Gas & Electric"
                subtitle="Investor-owned utility serving Northern and Central California"
                actions={
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm">
                      Edit
                    </Button>
                    <Button variant="primary" size="sm">
                      Save
                    </Button>
                  </div>
                }
              />
            </div>
          </ComponentExample>

          {/* Section */}
          <ComponentExample
            name="Section"
            description="Consistent section spacing wrapper with optional heading. Provides vertical rhythm."
            usage={`<Section heading="Data Sources">
  <p>Content here...</p>
</Section>`}
          >
            <div className="rounded-lg border border-border-default bg-background-surface p-6">
              <Section heading="Example Section">
                <p className="text-sm text-text-body">
                  This is a section with a heading. Sections provide consistent spacing between major content blocks and
                  optional semantic headings.
                </p>
              </Section>
              <Section heading="Another Section">
                <p className="text-sm text-text-body">Multiple sections stack with consistent spacing.</p>
              </Section>
            </div>
          </ComponentExample>
        </div>
      </Section>

      {/* Data Display Components */}
      <Section heading="Data Display Components">
        <div className="space-y-8">
          {/* Kpi / KpiGroup */}
          <ComponentExample
            name="Kpi / KpiGroup"
            description="Metric display components from Edges. Use for dashboards, stats rows, and KPI visualizations."
            usage={`import { Kpi, KpiGroup } from "@texturehq/edges";

<KpiGroup cols={{ base: 1, sm: 2, md: 3 }} gap="lg">
  <Kpi label="Utilities" value={1234} />
  <Kpi label="Grid Operators" value={67} />
  <Kpi label="Power Plants" value={12345} />
</KpiGroup>`}
          >
            <div className="rounded-lg border border-border-default bg-background-surface p-6">
              <KpiGroup cols={{ base: 1, sm: 2, md: 3 }} gap="lg">
                <Kpi label="Utilities" value={1234} />
                <Kpi label="Grid Operators" value={67} />
                <Kpi label="Power Plants" value={12345} />
              </KpiGroup>
              <div className="mt-4 text-xs text-text-caption">
                💡 Kpi automatically formats numbers and supports loading states, trends, and custom formatters.
              </div>
            </div>
          </ComponentExample>

          {/* StatList */}
          <ComponentExample
            name="StatList"
            description="Field list component from Edges. Use for key-value pairs on detail pages, cards, or panels."
            usage={`import { StatList } from "@texturehq/edges";

<StatList
  items={[
    { label: "EIA ID", value: "12345" },
    { label: "Type", value: "Investor-Owned Utility" },
    { label: "State", value: "California" },
  ]}
/>`}
          >
            <div className="rounded-lg border border-border-default bg-background-surface p-6">
              <StatList
                items={[
                  { id: "eia-id", label: "EIA ID", value: "12345" },
                  { id: "type", label: "Type", value: "Investor-Owned Utility" },
                  { id: "state", label: "State", value: "California" },
                  { id: "customers", label: "Customers", value: 5500000, formatter: { type: "number" } },
                  {
                    id: "area",
                    label: "Service Area",
                    value: 70000,
                    formatter: (v) => (v ? `${v.toLocaleString()} sq mi` : "—"),
                  },
                ]}
              />
              <div className="mt-4 text-xs text-text-caption">
                💡 StatList supports formatters, conditional colors, thresholds, copy-to-clipboard, and mobile
                truncation.
              </div>
            </div>
          </ComponentExample>

          {/* DefinitionList */}
          <ComponentExample
            name="DefinitionList"
            description="Formatted definition list for term-description pairs. Used for data sources, glossaries, etc."
            usage={`<DefinitionList
  items={[
    { term: "EIA-860", description: "Annual Electric Generator Report" },
    { term: "HIFLD", description: "Homeland Infrastructure Foundation" },
  ]}
/>`}
          >
            <div className="rounded-lg border border-border-default bg-background-surface p-6">
              <DefinitionList
                items={[
                  {
                    term: "EIA-860",
                    description:
                      "Annual Electric Generator Report — power plants, generator details, fuel types, capacity data",
                  },
                  {
                    term: "HIFLD",
                    description:
                      "Homeland Infrastructure Foundation — electric utility boundaries, 52,000+ transmission lines",
                  },
                  {
                    term: "DOE AFDC",
                    description:
                      "Alternative Fuels Data Center — 85,000+ EV charging stations, network, connector, access data",
                  },
                ]}
              />
            </div>
          </ComponentExample>
        </div>
      </Section>

      {/* Integration Guide */}
      <Section heading="Integration Guide">
        <div className="space-y-4 rounded-lg border border-border-default bg-background-surface p-6">
          <h3 className="font-semibold text-text-heading">Using Components</h3>

          <div className="space-y-3 text-sm text-text-body">
            <p>
              <strong>Import from:</strong>{" "}
              <code className="rounded bg-background-muted px-1.5 py-0.5 font-mono text-xs">@/components/ui</code>
            </p>

            <p>
              <strong>Styling:</strong> All components use pure Tailwind utilities with Edges tokens (
              <code className="rounded bg-background-muted px-1.5 py-0.5 font-mono text-xs">--color-*</code>,
              <code className="rounded bg-background-muted px-1.5 py-0.5 font-mono text-xs">--space-*</code>). No custom
              CSS files.
            </p>

            <p>
              <strong>Composition:</strong> Build page layouts by composing these components. Use Edges atoms (Button,
              TextField, etc.) for interactive elements.
            </p>

            <p>
              <strong>Responsive:</strong> All components are mobile-first responsive. Test at 375px (mobile), 768px
              (tablet), and 1440px (desktop).
            </p>
          </div>

          <div className="mt-4 rounded-md bg-background-muted p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-caption">
              Example Page Structure
            </h4>
            <pre className="overflow-x-auto text-xs">
              <code>{`import { PageShell, PageHeader, Section } from "@/components/ui";
import { Button, Kpi, KpiGroup } from "@texturehq/edges";

export default function MyPage() {
  return (
    <PageShell>
      <PageHeader
        title="Page Title"
        subtitle="Description"
        actions={<Button>Action</Button>}
      />
      
      <Section heading="Metrics">
        <KpiGroup cols={{ base: 1, sm: 2, md: 3 }} gap="lg">
          <Kpi value={1234} label="Total" />
          <Kpi value={567} label="Active" />
          <Kpi value={0.89} formatter={{ type: "percent" }} label="Rate" />
        </KpiGroup>
      </Section>
      
      <Section heading="Content">
        <p>Your content here...</p>
      </Section>
    </PageShell>
  );
}`}</code>
            </pre>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}

/**
 * ComponentExample wrapper for showcasing individual components
 */
function ComponentExample({
  name,
  description,
  usage,
  children,
}: {
  name: string;
  description: string;
  usage: string;
  children: React.ReactNode;
}) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="rounded-lg border border-border-default bg-background-body p-6">
      <div className="mb-4">
        <h3 className="mb-1 font-mono text-lg font-semibold text-text-heading">{name}</h3>
        <p className="text-sm text-text-muted">{description}</p>
      </div>

      {/* Live Example */}
      <div className="mb-4">{children}</div>

      {/* Code Toggle */}
      <button
        type="button"
        onClick={() => setShowCode(!showCode)}
        className="text-xs font-medium text-brand-primary hover:underline"
      >
        {showCode ? "Hide code" : "Show code"}
      </button>

      {/* Usage Code */}
      {showCode && (
        <div className="mt-3 overflow-x-auto rounded-md bg-background-muted p-4">
          <pre className="text-xs">
            <code>{usage}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
