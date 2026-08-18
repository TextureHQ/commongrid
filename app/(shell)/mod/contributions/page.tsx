"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { Badge, Button, Card, Icon, Loader, SegmentedControl } from "@texturehq/edges";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ContentPage } from "@/components/ContentPage";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { parseStatusParam, type QueueStatus, STATUS_OPTIONS } from "./queue-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contributor {
  display_name: string;
  contribution_count: number;
  role: string;
}

interface Contribution {
  id: string;
  entityType: string;
  entitySlug: string;
  entityId: string;
  editSummary: string;
  status: string;
  createdAt: string;
  contributor: Contributor | null;
}

interface ContributionsResponse {
  data: Contribution[];
  pagination: {
    cursor: string | null;
    total: number;
    hasMore: boolean;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(iso);
}

function entityTypeLabel(et: string): string {
  const labels: Record<string, string> = {
    utility: "Utility",
    power_plant: "Power Plant",
    ev_station: "EV Station",
    territory: "Territory",
    transmission_line: "Transmission Line",
    pricing_node: "Pricing Node",
    iso: "ISO",
    rto: "RTO",
    balancing_authority: "Balancing Authority",
    region: "Region",
    program: "Program",
  };
  return labels[et] ?? et;
}

function statusBadge(status: string) {
  const config: Record<string, { variant: "success" | "warning" | "error" | "info" | "neutral"; label: string }> = {
    pending: { variant: "warning", label: "Pending" },
    approved: { variant: "success", label: "Approved" },
    auto_approved: { variant: "success", label: "Auto-Approved" },
    returned: { variant: "error", label: "Returned" },
    changes_requested: { variant: "info", label: "Changes Requested" },
  };
  const c = config[status] ?? { variant: "neutral" as const, label: status };
  return (
    <Badge size="sm" shape="pill" variant={c.variant}>
      {c.label}
    </Badge>
  );
}

const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ModerationContributionsPageInner() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { user, isLoading: userLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialStatus = useMemo(() => parseStatusParam(searchParams.get("status")), [searchParams]);

  const [statusFilter, setStatusFilter] = useState<QueueStatus | "all">(initialStatus);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<ContributionsResponse["pagination"] | null>(null);

  const fetchContributions = useCallback(
    async ({ cursor, status }: { cursor?: string; status?: QueueStatus | "all" } = {}) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(DEFAULT_LIMIT));
        const effectiveStatus = status ?? statusFilter;
        if (effectiveStatus !== "all") {
          params.set("status", effectiveStatus);
        }
        if (cursor) {
          params.set("cursor", cursor);
        }

        const res = await fetch(`/api/v1/mod/contributions?${params.toString()}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json?.error?.message ?? `Failed to load contributions (${res.status})`);
        }
        const json: ContributionsResponse = await res.json();
        setContributions((prev) => (cursor ? [...prev, ...(json.data ?? [])] : (json.data ?? [])));
        setPagination(json.pagination ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contributions");
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter]
  );

  // Sync URL query param when filter changes
  const handleStatusChange = useCallback(
    (value: QueueStatus | "all") => {
      setStatusFilter(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        params.delete("status");
      } else {
        params.set("status", value);
      }
      router.replace(`/mod/contributions?${params.toString()}`, { scroll: false });
      fetchContributions({ status: value });
    },
    [fetchContributions, router, searchParams]
  );

  // Load the queue once the user is known. initialStatus is stable for the
  // lifetime of this component because it is recomputed from the URL via
  // useMemo above, but we only want the fetch to fire once per mount.
  useEffect(() => {
    if (!user) return;
    fetchContributions({ status: initialStatus });
  }, [user, fetchContributions, initialStatus]);

  // Keep local filter in sync if the URL is changed externally.
  useEffect(() => {
    const next = parseStatusParam(searchParams.get("status"));
    if (next !== statusFilter) {
      setStatusFilter(next);
    }
  }, [searchParams, statusFilter]);

  const userLoaded = clerkLoaded && !userLoading;

  if (!userLoaded) {
    return (
      <ContentPage>
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </ContentPage>
    );
  }

  if (!clerkUser) {
    return (
      <ContentPage>
        <ContentPage.Header
          title="Moderation Queue"
          breadcrumbs={[{ label: "Moderation" }, { label: "Contributions" }]}
        />
        <ContentPage.Body>
          <div className="px-4 sm:px-6 py-12">
            <Card variant="outlined">
              <Card.Content className="py-16 text-center">
                <Icon name="ShieldCheck" size={48} className="text-text-muted mx-auto mb-4" />
                <div className="text-lg font-semibold text-text-heading mb-2">Authentication Required</div>
                <p className="text-text-muted mb-6 max-w-md mx-auto">Please sign in to access the moderation queue.</p>
                <SignInButton mode="modal">
                  <Button variant="brand" size="lg">
                    Sign In
                  </Button>
                </SignInButton>
              </Card.Content>
            </Card>
          </div>
        </ContentPage.Body>
      </ContentPage>
    );
  }

  if (user && user.role !== "admin" && user.role !== "moderator") {
    return (
      <ContentPage>
        <ContentPage.Header
          title="Moderation Queue"
          breadcrumbs={[{ label: "Moderation" }, { label: "Contributions" }]}
        />
        <ContentPage.Body>
          <div className="px-4 sm:px-6 py-12">
            <Card variant="outlined">
              <Card.Content className="py-16 text-center">
                <Icon name="ShieldSlash" size={48} className="text-text-muted mx-auto mb-4" />
                <div className="text-lg font-semibold text-text-heading mb-2">Access Denied</div>
                <p className="text-text-muted mb-6 max-w-md mx-auto">
                  You need moderator or admin privileges to access this page.
                </p>
                <Button variant="brand" size="lg" href="/">
                  Go Home
                </Button>
              </Card.Content>
            </Card>
          </div>
        </ContentPage.Body>
      </ContentPage>
    );
  }

  const totalCount = pagination?.total ?? 0;
  const hasMore = pagination?.hasMore ?? false;

  return (
    <ContentPage>
      <ContentPage.Header
        title="Moderation Queue"
        breadcrumbs={[{ label: "Moderation" }, { label: "Contributions" }]}
        actions={
          <Button variant="secondary" icon="ArrowsClockwise" size="sm" onPress={() => fetchContributions()}>
            Refresh
          </Button>
        }
      />

      <ContentPage.Body>
        <div className="px-4 sm:px-6 space-y-4 pb-8">
          <div className="flex items-center justify-between gap-4">
            <SegmentedControl
              value={statusFilter}
              onChange={(val) => handleStatusChange(val as QueueStatus | "all")}
              options={STATUS_OPTIONS}
            />
            <span className="text-sm text-text-muted hidden sm:inline">{totalCount} total</span>
          </div>

          {isLoading && contributions.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader size={24} />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {!isLoading && !error && contributions.length === 0 && (
            <Card variant="outlined">
              <Card.Content className="py-16 text-center">
                <Icon name="CheckCircle" size={48} className="text-text-muted mx-auto mb-4" />
                <div className="text-lg font-semibold text-text-heading mb-2">No contributions found</div>
                <p className="text-text-muted mb-6 max-w-md mx-auto">
                  {statusFilter === "all"
                    ? "The moderation queue is empty."
                    : `No contributions with status "${statusFilter.replace("_", " ")}".`}
                </p>
                <Button variant="secondary" size="sm" href="/mod">
                  Back to Dashboard
                </Button>
              </Card.Content>
            </Card>
          )}

          {!error && contributions.length > 0 && (
            <div className="space-y-3">
              {contributions.map((contrib) => (
                <Link
                  key={contrib.id}
                  href={`/mod/contributions/${contrib.id}`}
                  className="block p-4 rounded-lg border border-border-default hover:border-border-strong transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge size="sm" shape="pill" variant="neutral">
                          {entityTypeLabel(contrib.entityType)}
                        </Badge>
                        {statusBadge(contrib.status)}
                        <span className="text-sm text-text-muted">#{contrib.id.slice(0, 8)}</span>
                      </div>
                      <div className="text-base font-medium text-text-heading">
                        {contrib.editSummary || "No summary provided"}
                      </div>
                      {contrib.contributor && (
                        <div className="text-sm text-text-muted">
                          Submitted by {contrib.contributor.display_name} ({contrib.contributor.contribution_count}{" "}
                          contributions)
                          {contrib.contributor.role === "admin" && (
                            <Badge size="sm" shape="pill" variant="error" className="ml-2">
                              Admin
                            </Badge>
                          )}
                          {contrib.contributor.role === "moderator" && (
                            <Badge size="sm" shape="pill" variant="info" className="ml-2">
                              Moderator
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-text-muted shrink-0">{formatRelativeTime(contrib.createdAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="secondary"
                size="sm"
                isDisabled={isLoading}
                onPress={() => fetchContributions({ cursor: pagination?.cursor ?? undefined })}
              >
                {isLoading ? "Loading…" : "Load More"}
              </Button>
            </div>
          )}
        </div>
      </ContentPage.Body>
    </ContentPage>
  );
}

// `useSearchParams` opts the component into client-side rendering, which makes
// the static prerender of this route bail unless a boundary is present. The
// queue is auth-gated and always client-fetched, so there is nothing useful to
// prerender above it — same pattern as /grid-operators.
export default function ModerationContributionsPage() {
  return (
    <Suspense>
      <ModerationContributionsPageInner />
    </Suspense>
  );
}
