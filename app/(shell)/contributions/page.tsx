"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { Badge, Button, Card, Icon, Loader, PageLayout, SegmentedControl } from "@texturehq/edges";
import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contribution {
  id: string;
  entityType: string;
  entitySlug: string;
  entityId: string;
  editSummary: string;
  status: string;
  sourceType: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  createdAt: string;
  reviewedAt: string | null;
  moderatorComment: string | null;
  autoApproved: boolean;
}

type StatusFilter = "all" | "pending" | "approved" | "returned" | "rejected";

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

function statusBadge(status: string) {
  const config: Record<string, { variant: "success" | "warning" | "error" | "info" | "neutral"; label: string }> = {
    pending: { variant: "warning", label: "Pending" },
    approved: { variant: "success", label: "Approved" },
    auto_approved: { variant: "success", label: "Auto-Approved" },
    returned: { variant: "error", label: "Returned" },
    changes_requested: { variant: "info", label: "Changes Requested" },
    version_conflict: { variant: "neutral", label: "Version Conflict" },
  };
  const c = config[status] ?? { variant: "neutral" as const, label: status };
  return (
    <Badge size="sm" shape="pill" variant={c.variant}>
      {c.label}
    </Badge>
  );
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

type IconName = React.ComponentProps<typeof Icon>["name"];

function entityTypeIcon(et: string): IconName {
  const icons: Record<string, IconName> = {
    utility: "Buildings",
    power_plant: "Factory",
    ev_station: "Lightning",
    territory: "MapTrifold",
    transmission_line: "CellTower",
    pricing_node: "Lightning",
    iso: "Lightning",
    rto: "Lightning",
    balancing_authority: "Lightning",
    region: "GlobeHemisphereWest",
    program: "ClipboardText",
  };
  return icons[et] ?? "Article";
}

function entityDetailHref(entityType: string, entitySlug: string): string {
  const pathMap: Record<string, string> = {
    power_plant: "power-plants",
    ev_station: "ev-charging",
    pricing_node: "pricing-nodes",
    utility: "grid-operators",
  };
  const pathSegment = pathMap[entityType] ?? entityType.replace(/_/g, "-") + "s";
  return `/${pathSegment}/${entitySlug}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ContributionsDashboard() {
  const { user, isLoaded: userLoaded } = useUser();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchContributions = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      // The API allows filtering by user_id — we use the Clerk user id
      params.set("user_id", user.id);

      const res = await fetch(`/api/v1/contributions?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load contributions (${res.status})`);
      const json = await res.json();
      setContributions(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contributions");
    } finally {
      setIsLoading(false);
    }
  }, [user, statusFilter]);

  useEffect(() => {
    if (userLoaded && user) {
      fetchContributions();
    }
  }, [userLoaded, user, fetchContributions]);

  // Stats
  const totalCount = contributions.length;
  const approvedCount = contributions.filter((c) => c.status === "approved" || c.status === "auto_approved").length;
  const pendingCount = contributions.filter((c) => c.status === "pending").length;
  const approvalRate = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

  if (!userLoaded) {
    return (
      <PageLayout maxWidth={896}>
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  // Show sign-in prompt for unauthenticated users
  if (!user) {
    return (
      <PageLayout maxWidth={896}>
        <PageLayout.Header title="My Contributions" breadcrumbs={[{ label: "Contributions" }]} />
        <PageLayout.Content>
          <div className="px-4 sm:px-6 py-12">
            <Card variant="outlined">
              <Card.Content className="py-16 text-center">
                <Icon name="UserCircle" size={48} className="text-text-muted mx-auto mb-4" />
                <div className="text-lg font-semibold text-text-heading mb-2">Sign in to view your contributions</div>
                <p className="text-text-muted mb-6 max-w-md mx-auto">
                  Track your suggested edits and help improve CommonGrid data quality.
                </p>
                <SignInButton mode="modal">
                  <Button variant="brand" size="lg">
                    Sign In
                  </Button>
                </SignInButton>
              </Card.Content>
            </Card>
          </div>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return (
    <PageLayout maxWidth={896}>
      <PageLayout.Header
        title="My Contributions"
        breadcrumbs={[{ label: "Contributions" }]}
        actions={
          <Button variant="secondary" icon="ArrowsClockwise" size="sm" onPress={fetchContributions}>
            Refresh
          </Button>
        }
      />

      <PageLayout.Content>
        {/* Stats */}
        <div className="px-4 sm:px-6 pb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total", value: totalCount, icon: "Article" as const },
              { label: "Pending", value: pendingCount, icon: "Clock" as const },
              { label: "Approved", value: approvedCount, icon: "CheckCircle" as const },
              { label: "Approval Rate", value: `${approvalRate}%`, icon: "ChartBar" as const },
            ].map((stat) => (
              <Card key={stat.label} variant="outlined">
                <Card.Content className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name={stat.icon} size={14} className="text-text-muted" />
                    <span className="text-xs text-text-muted font-medium">{stat.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-text-heading">{stat.value}</div>
                </Card.Content>
              </Card>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 sm:px-6 pb-4">
          <SegmentedControl
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as StatusFilter)}
            options={[
              { id: "all", label: "All" },
              { id: "pending", label: "Pending" },
              { id: "approved", label: "Approved" },
              { id: "returned", label: "Returned" },
            ]}
          />
        </div>

        {/* Contribution list */}
        <div className="px-4 sm:px-6 pb-8">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader size={24} />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {!isLoading && !error && contributions.length === 0 && (
            <Card variant="outlined">
              <Card.Content className="py-12 text-center">
                <Icon name="Article" size={40} className="text-text-muted mx-auto mb-3" />
                <div className="text-base font-medium text-text-heading mb-1">No contributions yet</div>
                <p className="text-sm text-text-muted mb-4">
                  Suggest edits on any entity page to help improve CommonGrid data.
                </p>
                <Button variant="brand" href="/explore">
                  Explore Entities
                </Button>
              </Card.Content>
            </Card>
          )}

          {!isLoading && !error && contributions.length > 0 && (
            <div className="space-y-3">
              {contributions.map((contribution) => {
                const changeCount = Object.keys(contribution.changes ?? {}).length;
                return (
                  <Card
                    key={contribution.id}
                    variant="outlined"
                    className="hover:border-brand-primary/30 transition-colors"
                  >
                    <Card.Content className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        {/* Left: Info */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-background-muted flex items-center justify-center">
                            <Icon
                              name={entityTypeIcon(contribution.entityType)}
                              size={16}
                              className="text-text-muted"
                            />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={entityDetailHref(contribution.entityType, contribution.entitySlug)}
                              className="text-sm font-medium text-text-heading hover:text-brand-primary transition-colors"
                            >
                              {contribution.entitySlug}
                            </Link>
                            <div className="text-xs text-text-muted mt-0.5">
                              {entityTypeLabel(contribution.entityType)} · {changeCount} field
                              {changeCount !== 1 ? "s" : ""}
                            </div>
                            <div className="text-sm text-text-body mt-1 line-clamp-2">{contribution.editSummary}</div>
                          </div>
                        </div>

                        {/* Right: Status + time */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {statusBadge(contribution.status)}
                          <span className="text-xs text-text-muted">{formatRelativeTime(contribution.createdAt)}</span>
                        </div>
                      </div>

                      {/* Moderator comment */}
                      {contribution.moderatorComment && (
                        <div className="mt-3 bg-background-muted rounded-lg px-3 py-2">
                          <div className="text-xs font-medium text-text-muted mb-0.5">Moderator Feedback</div>
                          <div className="text-sm text-text-body">{contribution.moderatorComment}</div>
                        </div>
                      )}
                    </Card.Content>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </PageLayout.Content>
    </PageLayout>
  );
}
