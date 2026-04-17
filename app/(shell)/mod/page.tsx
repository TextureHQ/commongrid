"use client";

import { SignInButton } from "@clerk/nextjs";
import { Badge, Button, Card, Icon, Loader, PageLayout } from "@texturehq/edges";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModStats {
  pending_count: number;
  flagged_count: number;
  reviewed_today: number;
  reviewed_this_week: number;
  average_review_time_hours: number;
}

interface Contribution {
  id: string;
  entityType: string;
  entitySlug: string;
  entityId: string;
  editSummary: string;
  status: string;
  createdAt: string;
  contributor: {
    display_name: string;
    contribution_count: number;
    role: string;
  } | null;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModerationDashboardPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const [stats, setStats] = useState<ModStats | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [contribLoading, setContribLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [contribError, setContribError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Fetch stats
    fetch("/api/v1/mod/stats")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch stats");
        return res.json();
      })
      .then((json) => {
        setStats(json.data);
        setStatsLoading(false);
      })
      .catch((err) => {
        setStatsError(err.message);
        setStatsLoading(false);
      });

    // Fetch pending contributions
    fetch("/api/v1/mod/contributions?status=pending&limit=20")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch contributions");
        return res.json();
      })
      .then((json: ContributionsResponse) => {
        setContributions(json.data);
        setContribLoading(false);
      })
      .catch((err) => {
        setContribError(err.message);
        setContribLoading(false);
      });
  }, [user]);

  // Show loader while user is loading
  if (userLoading) {
    return (
      <PageLayout maxWidth={1200}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader />
        </div>
      </PageLayout>
    );
  }

  // Show sign-in prompt if not authenticated
  if (!user) {
    return (
      <PageLayout maxWidth={1200}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Icon name="ShieldCheck" size={48} className="text-text-muted" />
          <h1 className="text-2xl font-semibold text-text-heading">Authentication Required</h1>
          <p className="text-text-muted">Please sign in to access the moderation dashboard.</p>
          <SignInButton mode="modal">
            <Button variant="primary">Sign In</Button>
          </SignInButton>
        </div>
      </PageLayout>
    );
  }

  // Show access denied if not admin/moderator
  if (user.role !== "admin" && user.role !== "moderator") {
    return (
      <PageLayout maxWidth={1200}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Icon name="ShieldSlash" size={48} className="text-text-muted" />
          <h1 className="text-2xl font-semibold text-text-heading">Access Denied</h1>
          <p className="text-text-muted">You need moderator or admin privileges to access this page.</p>
          <Button variant="secondary" href="/">
            Go Home
          </Button>
        </div>
      </PageLayout>
    );
  }

  // Render dashboard
  return (
    <PageLayout maxWidth={1200}>
      <div className="py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="ShieldCheck" size={28} className="text-text-heading" />
            <h1 className="text-3xl font-semibold text-text-heading">Moderation Dashboard</h1>
            <Badge size="sm" shape="pill" variant={user.role === "admin" ? "error" : "info"}>
              {user.role === "admin" ? "Admin" : "Moderator"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {user.role === "admin" && (
              <Button variant="secondary" href="/mod/users">
                <Icon name="Users" size="sm" />
                Manage Users
              </Button>
            )}
            <Button variant="secondary" href="/contributions">
              View All Contributions
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <div className="p-4 space-y-1">
              <div className="text-sm text-text-muted">Pending Contributions</div>
              {statsLoading ? (
                <Loader />
              ) : statsError ? (
                <div className="text-sm text-text-error">{statsError}</div>
              ) : (
                <div className="text-3xl font-semibold text-text-heading">{stats?.pending_count ?? 0}</div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-1">
              <div className="text-sm text-text-muted">Flagged Contributions</div>
              {statsLoading ? (
                <Loader />
              ) : statsError ? (
                <div className="text-sm text-text-error">{statsError}</div>
              ) : (
                <div className="text-3xl font-semibold text-text-heading">{stats?.flagged_count ?? 0}</div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-1">
              <div className="text-sm text-text-muted">Reviewed This Week</div>
              {statsLoading ? (
                <Loader />
              ) : statsError ? (
                <div className="text-sm text-text-error">{statsError}</div>
              ) : (
                <div className="text-3xl font-semibold text-text-heading">{stats?.reviewed_this_week ?? 0}</div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-1">
              <div className="text-sm text-text-muted">Avg Review Time</div>
              {statsLoading ? (
                <Loader />
              ) : statsError ? (
                <div className="text-sm text-text-error">{statsError}</div>
              ) : (
                <div className="text-3xl font-semibold text-text-heading">
                  {stats?.average_review_time_hours.toFixed(1) ?? "0"}h
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Pending Contributions Queue */}
        <Card>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-text-heading">Pending Review Queue</h2>
              <Button variant="secondary" href="/mod/contributions?status=pending" size="sm">
                View All
              </Button>
            </div>

            {contribLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader />
              </div>
            ) : contribError ? (
              <div className="text-sm text-text-error py-8 text-center">{contribError}</div>
            ) : contributions.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <Icon name="CheckCircle" size={40} className="mx-auto mb-2" />
                <p>No pending contributions. Great work!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contributions.map((contrib) => (
                  <Link
                    key={contrib.id}
                    href={`/mod/contributions/${contrib.id}`}
                    className="block p-4 rounded-lg border border-border-default hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge size="sm" shape="pill" variant="neutral">
                            {entityTypeLabel(contrib.entityType)}
                          </Badge>
                          <span className="text-sm text-text-muted">#{contrib.id.slice(0, 8)}</span>
                        </div>
                        <div className="text-base font-medium text-text-heading">
                          {contrib.editSummary || "No summary provided"}
                        </div>
                        {contrib.contributor && (
                          <div className="text-sm text-text-muted">
                            Submitted by {contrib.contributor.display_name} ({contrib.contributor.contribution_count}{" "}
                            contributions)
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-text-muted shrink-0">{formatRelativeTime(contrib.createdAt)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
