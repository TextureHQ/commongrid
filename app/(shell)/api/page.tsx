"use client";

import { Badge, Card, Heading, PageLayout } from "@texturehq/edges";
import Link from "next/link";

type Param = {
  name: string;
  in: "query" | "path";
  required?: boolean;
  description: string;
  example?: string;
};

type Endpoint = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  summary: string;
  description?: string;
  params?: Param[];
};

type Group = {
  tag: string;
  description: string;
  endpoints: Endpoint[];
};

const BASE_URL = "https://commongrid.info/api/v1";

const endpointGroups: Group[] = [
  {
    tag: "Search",
    description: "Full-text search across all entity types.",
    endpoints: [
      {
        method: "GET",
        path: "/search",
        summary: "Global search",
        description:
          "Search across utilities, power plants, EV stations, ISOs, RTOs, balancing authorities, and pricing nodes. Returns grouped results by entity type.",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query (min 2, max 200 chars)",
            example: "Pacific Gas",
          },
          { name: "limit", in: "query", description: "Max results per entity type (1–25, default 5)", example: "10" },
          {
            name: "types",
            in: "query",
            description:
              "Comma-separated entity types to filter (utilities, power-plants, ev-stations, isos, rtos, balancing-authorities, pricing-nodes)",
            example: "utilities,isos",
          },
        ],
      },
    ],
  },
  {
    tag: "Utilities",
    description: "Electric, gas, and water utilities sourced from EIA-861.",
    endpoints: [
      {
        method: "GET",
        path: "/utilities",
        summary: "List utilities",
        params: [
          {
            name: "segment",
            in: "query",
            description: "Filter by segment (electric, gas, water)",
            example: "electric",
          },
          { name: "status", in: "query", description: "Filter by operational status" },
          { name: "state", in: "query", description: "Filter by 2-letter US state code", example: "CA" },
          { name: "iso", in: "query", description: "Filter by ISO ID" },
          { name: "rto", in: "query", description: "Filter by RTO ID" },
          { name: "ba", in: "query", description: "Filter by Balancing Authority ID" },
          { name: "hasGeneration", in: "query", description: "Filter by generation capability (true/false)" },
          { name: "hasTransmission", in: "query", description: "Filter by transmission capability (true/false)" },
          { name: "hasDistribution", in: "query", description: "Filter by distribution capability (true/false)" },
          {
            name: "include",
            in: "query",
            description: "Embed related entities — comma-separated: iso, rto, ba",
            example: "iso,rto",
          },
          {
            name: "search",
            in: "query",
            description: "Full-text search by name (min 2 chars)",
            example: "Pacific Gas",
          },
          { name: "limit", in: "query", description: "Page size (1–200, default 50)" },
          { name: "cursor", in: "query", description: "Pagination cursor from meta.nextCursor" },
          {
            name: "fields",
            in: "query",
            description: "Sparse fieldset — comma-separated field names",
            example: "id,slug,name",
          },
        ],
      },
      {
        method: "GET",
        path: "/utilities/{slug}",
        summary: "Get utility by slug",
        params: [
          { name: "slug", in: "path", required: true, description: "Utility slug", example: "pacific-gas-electric" },
          { name: "include", in: "query", description: "Embed related entities: iso, rto, ba", example: "iso" },
        ],
      },
    ],
  },
  {
    tag: "Power Plants",
    description: "Power generation facilities from EIA-860. 15,000+ plants nationwide.",
    endpoints: [
      {
        method: "GET",
        path: "/power-plants",
        summary: "List power plants",
        params: [
          { name: "state", in: "query", description: "Filter by 2-letter US state code", example: "TX" },
          {
            name: "fuelCategory",
            in: "query",
            description: "Filter by fuel category (solar, wind, nuclear, gas, coal, hydro, etc.)",
            example: "solar",
          },
          { name: "status", in: "query", description: "Filter by operational status" },
          { name: "utilityId", in: "query", description: "Filter by utility ID" },
          { name: "baId", in: "query", description: "Filter by balancing authority ID" },
          { name: "search", in: "query", description: "Search by plant name (min 2 chars)" },
          { name: "sort", in: "query", description: "Sort field: name, totalCapacityMw, state (default: name)" },
          { name: "order", in: "query", description: "Sort order: asc, desc (default: asc)" },
          { name: "limit", in: "query", description: "Page size (1–200, default 50)" },
          { name: "cursor", in: "query", description: "Pagination cursor from meta.nextCursor" },
          { name: "fields", in: "query", description: "Sparse fieldset", example: "id,slug,name,totalCapacityMw" },
        ],
      },
      {
        method: "GET",
        path: "/power-plants/{slug}",
        summary: "Get power plant by slug",
        params: [{ name: "slug", in: "path", required: true, description: "Power plant slug" }],
      },
    ],
  },
  {
    tag: "EV Stations",
    description: "EV charging stations from DOE AFDC. 85,000+ stations, updated weekly.",
    endpoints: [
      {
        method: "GET",
        path: "/ev-stations",
        summary: "List EV charging stations",
        params: [
          { name: "state", in: "query", description: "Filter by 2-letter US state code", example: "CA" },
          {
            name: "network",
            in: "query",
            description: "Filter by charging network (Tesla, ChargePoint, etc.)",
            example: "Tesla",
          },
          { name: "search", in: "query", description: "Search by station name or address (min 2 chars)" },
          { name: "limit", in: "query", description: "Page size (1–200, default 50)" },
          { name: "cursor", in: "query", description: "Pagination cursor from meta.nextCursor" },
          { name: "fields", in: "query", description: "Sparse fieldset" },
        ],
      },
      {
        method: "GET",
        path: "/ev-stations/{slug}",
        summary: "Get EV charging station by slug",
        params: [{ name: "slug", in: "path", required: true, description: "EV station slug" }],
      },
    ],
  },
  {
    tag: "Territories",
    description: "Electric utility service territory boundaries from HIFLD.",
    endpoints: [
      {
        method: "GET",
        path: "/territories",
        summary: "List service territories",
        params: [
          { name: "limit", in: "query", description: "Page size (1–200, default 50)" },
          { name: "cursor", in: "query", description: "Pagination cursor from meta.nextCursor" },
        ],
      },
      {
        method: "GET",
        path: "/territories/lookup",
        summary: "Look up territory by coordinates",
        description: "Returns the utility service territory containing the given lat/lng point.",
        params: [
          { name: "lat", in: "query", required: true, description: "Latitude", example: "37.7749" },
          { name: "lng", in: "query", required: true, description: "Longitude", example: "-122.4194" },
        ],
      },
      {
        method: "GET",
        path: "/territories/{slug}",
        summary: "Get territory by slug",
        params: [{ name: "slug", in: "path", required: true, description: "Territory slug" }],
      },
      {
        method: "GET",
        path: "/territories/{slug}/geometry",
        summary: "Get territory GeoJSON geometry",
        description: "Returns the GeoJSON polygon boundary for a territory.",
        params: [{ name: "slug", in: "path", required: true, description: "Territory slug" }],
      },
    ],
  },
  {
    tag: "Grid Operators",
    description: "ISOs, RTOs, and Balancing Authorities.",
    endpoints: [
      {
        method: "GET",
        path: "/isos",
        summary: "List ISOs",
        params: [
          { name: "limit", in: "query", description: "Page size" },
          { name: "cursor", in: "query", description: "Pagination cursor" },
        ],
      },
      {
        method: "GET",
        path: "/isos/{slug}",
        summary: "Get ISO by slug",
        params: [{ name: "slug", in: "path", required: true, description: "ISO slug", example: "caiso" }],
      },
      {
        method: "GET",
        path: "/rtos",
        summary: "List RTOs",
        params: [
          { name: "limit", in: "query", description: "Page size" },
          { name: "cursor", in: "query", description: "Pagination cursor" },
        ],
      },
      {
        method: "GET",
        path: "/rtos/{slug}",
        summary: "Get RTO by slug",
        params: [{ name: "slug", in: "path", required: true, description: "RTO slug" }],
      },
      {
        method: "GET",
        path: "/balancing-authorities",
        summary: "List balancing authorities",
        params: [
          { name: "limit", in: "query", description: "Page size" },
          { name: "cursor", in: "query", description: "Pagination cursor" },
        ],
      },
      {
        method: "GET",
        path: "/balancing-authorities/{slug}",
        summary: "Get balancing authority by slug",
        params: [{ name: "slug", in: "path", required: true, description: "Balancing authority slug" }],
      },
    ],
  },
  {
    tag: "Pricing Nodes",
    description: "Wholesale electricity pricing nodes from CAISO, PJM, ERCOT, MISO, NYISO, ISO-NE, and SPP.",
    endpoints: [
      {
        method: "GET",
        path: "/pricing-nodes",
        summary: "List pricing nodes",
        params: [
          { name: "iso", in: "query", description: "Filter by ISO ID" },
          { name: "nodeType", in: "query", description: "Filter by node type" },
          { name: "search", in: "query", description: "Search by node name (min 2 chars)" },
          { name: "limit", in: "query", description: "Page size (1–200, default 50)" },
          { name: "cursor", in: "query", description: "Pagination cursor" },
          { name: "fields", in: "query", description: "Sparse fieldset" },
        ],
      },
      {
        method: "GET",
        path: "/pricing-nodes/{slug}",
        summary: "Get pricing node by slug",
        params: [{ name: "slug", in: "path", required: true, description: "Pricing node slug" }],
      },
    ],
  },
  {
    tag: "Regions",
    description: "Geographic regions used for data organization.",
    endpoints: [
      {
        method: "GET",
        path: "/regions",
        summary: "List regions",
        params: [
          { name: "limit", in: "query", description: "Page size" },
          { name: "cursor", in: "query", description: "Pagination cursor" },
        ],
      },
      {
        method: "GET",
        path: "/regions/{slug}",
        summary: "Get region by slug",
        params: [{ name: "slug", in: "path", required: true, description: "Region slug" }],
      },
    ],
  },
  {
    tag: "Programs",
    description: "Utility programs and incentives — demand response, rebates, EV programs, and more.",
    endpoints: [
      {
        method: "GET",
        path: "/programs",
        summary: "List programs",
        params: [
          { name: "state", in: "query", description: "Filter by 2-letter US state code" },
          { name: "programType", in: "query", description: "Filter by program type" },
          { name: "status", in: "query", description: "Filter by status (active, inactive)" },
          { name: "search", in: "query", description: "Search by program name (min 2 chars)" },
          { name: "limit", in: "query", description: "Page size" },
          { name: "cursor", in: "query", description: "Pagination cursor" },
        ],
      },
      {
        method: "GET",
        path: "/programs/{slug}",
        summary: "Get program by slug",
        params: [{ name: "slug", in: "path", required: true, description: "Program slug" }],
      },
    ],
  },
];

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-feedback-success/10 text-feedback-success border border-feedback-success/30",
    POST: "bg-brand-primary/10 text-brand-primary border border-brand-primary/30",
    DELETE: "bg-feedback-error/10 text-feedback-error border border-feedback-error/30",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono ${colors[method] ?? ""}`}>
      {method}
    </span>
  );
}

export default function ApiDocsPage() {
  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header */}
        <div>
          <Heading tag="h1" size="xl">
            API Reference
          </Heading>
          <p className="text-text-muted text-base mt-2">
            REST API for energy infrastructure data — utilities, power plants, EV stations, grid operators, and more.
          </p>
          <p className="text-text-muted text-sm mt-1">
            Base URL:{" "}
            <code className="font-mono text-text-body text-xs bg-background-muted px-1.5 py-0.5 rounded">
              {BASE_URL}
            </code>
          </p>
        </div>

        {/* Auth */}
        <Card>
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-text-heading text-lg">Authentication</h2>
            <p className="text-sm text-text-body">
              All endpoints are publicly accessible at the <strong>Anonymous tier</strong> (60 req/hr). Create a free
              API key in the{" "}
              <Link href="/developers" className="text-brand-primary hover:underline">
                Developer Dashboard
              </Link>{" "}
              to unlock the <strong>Registered tier</strong> (5,000 req/hr).
            </p>
            <div className="bg-background-muted rounded-lg p-4">
              <code className="text-sm font-mono text-text-body">Authorization: Bearer cg_your_api_key</code>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 border border-border-default rounded-lg text-center">
                <div className="font-medium text-text-heading">Anonymous</div>
                <div className="text-text-muted text-xs mt-0.5">60 req/hr · No key</div>
              </div>
              <div className="p-3 border border-brand-light rounded-lg text-center bg-brand-light/5">
                <div className="font-medium text-text-heading">Registered</div>
                <div className="text-text-muted text-xs mt-0.5">5,000 req/hr · API key</div>
              </div>
              <div className="p-3 border border-border-default rounded-lg text-center">
                <div className="font-medium text-text-heading">Bulk</div>
                <div className="text-text-muted text-xs mt-0.5">50,000 req/hr · Contact us</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Pagination */}
        <Card>
          <div className="p-6 space-y-3">
            <h2 className="font-semibold text-text-heading text-lg">Pagination</h2>
            <p className="text-sm text-text-body">
              List endpoints use cursor-based pagination. Pass <code className="font-mono text-xs">limit</code> (max
              200) to control page size and <code className="font-mono text-xs">cursor</code> with the value from{" "}
              <code className="font-mono text-xs">meta.nextCursor</code> to fetch the next page.
            </p>
            <div className="bg-background-muted rounded-lg p-4">
              <pre className="text-xs font-mono text-text-body whitespace-pre-wrap">{`{
  "data": [...],
  "meta": {
    "total": 3000,
    "limit": 50,
    "nextCursor": "eyJ2IjoxLCJzIjp7InZhbHVlIjoiYWNtZS11dGlsaXR5In0sImlkIjoiYWJjMTIzIn0"
  }
}`}</pre>
            </div>
          </div>
        </Card>

        {/* Endpoints */}
        {endpointGroups.map((group) => (
          <div key={group.tag} className="space-y-4">
            <div className="flex items-center gap-3 border-b border-border-default pb-2">
              <h2 className="text-lg font-semibold text-text-heading">{group.tag}</h2>
              <p className="text-sm text-text-muted">{group.description}</p>
            </div>
            {group.endpoints.map((ep) => (
              <Card key={`${ep.method}-${ep.path}`}>
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <MethodBadge method={ep.method} />
                    <div className="flex-1">
                      <code className="font-mono text-sm text-text-heading">
                        {BASE_URL}
                        {ep.path}
                      </code>
                      <p className="text-sm font-medium text-text-body mt-0.5">{ep.summary}</p>
                      {ep.description && <p className="text-sm text-text-muted mt-1">{ep.description}</p>}
                    </div>
                  </div>
                  {ep.params && ep.params.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Parameters</p>
                      <div className="rounded-lg border border-border-default overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-background-muted">
                            <tr className="text-left">
                              <th className="px-3 py-2 text-xs font-semibold text-text-muted">Name</th>
                              <th className="px-3 py-2 text-xs font-semibold text-text-muted">In</th>
                              <th className="px-3 py-2 text-xs font-semibold text-text-muted">Description</th>
                              <th className="px-3 py-2 text-xs font-semibold text-text-muted">Example</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-default">
                            {ep.params.map((p) => (
                              <tr key={p.name} className="px-3">
                                <td className="px-3 py-2 align-top">
                                  <code className="text-xs font-mono text-text-heading">{p.name}</code>
                                  {p.required && <span className="ml-1 text-feedback-error text-xs">*</span>}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <Badge variant={p.in === "path" ? "warning" : "neutral"} size="sm">
                                    {p.in}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 align-top text-xs text-text-body">{p.description}</td>
                                <td className="px-3 py-2 align-top">
                                  {p.example && <code className="text-xs font-mono text-text-muted">{p.example}</code>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div className="border-t border-border-default pt-6 text-sm text-text-muted space-y-1 pb-12">
          <p>
            Need help?{" "}
            <a href="mailto:hello@texturehq.com" className="text-brand-primary hover:underline">
              hello@texturehq.com
            </a>{" "}
            · Source:{" "}
            <a
              href="https://github.com/TextureHQ/commongrid"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-primary hover:underline"
            >
              github.com/TextureHQ/commongrid
            </a>
          </p>
          <p>
            The OpenAPI spec is available at{" "}
            <Link href="/openapi.json" className="text-brand-primary hover:underline font-mono text-xs">
              /openapi.json
            </Link>
            .
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
