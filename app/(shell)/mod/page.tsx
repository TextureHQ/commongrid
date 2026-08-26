"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { Badge, Button, Card, Icon, Loader } from "@texturehq/edges";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ContentPage } from "@/components/ContentPage";
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
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { user, isLoading: userLoading } = useCurrentUser();
  const [stats, setStats] = useState<ModStats | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [contribLoading, setContribLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [contribError, setContribError] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    // Fetch stats
    fetch("/api/v1/mod/stats", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch stats");
        return res.json();
      })
      .then((json) => {
        setStats(json.data);
        setStatsError(null);
        setStatsLoading(false);
      })
      .catch((err) => {
        setStatsError(err.message);
        setStatsLoading(false);
      });

    // Fetch pending contributions
    fetch("/api/v1/mod/contributions?status=pending&limit=20", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch contributions");
        return res.json();
      })
      .then((json: ContributionsResponse) => {
        setContributions(json.data);
        setContribError(null);
        setContribLoading(false);
      })
      .catch((err) => {
        setContribError(err.message);
        setContribLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDashboard();

    // The dashboard is served from Next's client-side Router Cache when a
    // moderator navigates back from a review, which previously restored the
    // stale pre-approval queue (an approved item lingered until a manual hard
    // refresh — CG-243). Refetch whenever the tab regains focus/visibility so
    // the queue and stat cards self-heal to the current DB state.
    const refetchOnVisible = () => {
      if (document.visibilityState === "visible") loadDashboard();
    };
    window.addEventListener("focus", refetchOnVisible);
    document.addEventListener("visibilitychange", refetchOnVisible);
    return () => {
      window.removeEventListener("focus", refetchOnVisible);
      document.removeEventListener("visibilitychange", refetchOnVisible);
    };
  }, [user, loadDashboard]);

  // Show loader while user is loading
  if (!clerkLoaded || (clerkUser && userLoading)) {
    return (
      <ContentPage>
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </ContentPage>
    );
  }

  // Show sign-in prompt if not authenticated via Clerk
  if (!clerkUser) {
    return (
      <ContentPage>
        <ContentPage.Header title="Moderation Dashboard" breadcrumbs={[{ label: "Moderation" }]} />
        <ContentPage.Body>
          <div className="px-4 sm:px-6 py-12">
            <Card variant="outlined">
              <Card.Content className="py-16 text-center">
                <Icon name="ShieldCheck" size={48} className="text-text-muted mx-auto mb-4" />
                <div className="text-lg font-semibold text-text-heading mb-2">Authentication Required</div>
                <p className="text-text-muted mb-6 max-w-md mx-auto">
                  Please sign in to access the moderation dashboard.
                </p>
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

  // Show loader if Clerk user exists but app user not loaded yet
  if (clerkUser && !user) {
    return (
      <ContentPage>
        <div className="flex items-center justify-center py-24">
          <Loader size={32} />
        </div>
      </ContentPage>
    );
  }

  // Show access denied if app user loaded but not admin/moderator
  if (user && user.role !== "admin" && user.role !== "moderator") {
    return (
      <ContentPage>
        <ContentPage.Header title="Moderation Dashboard" breadcrumbs={[{ label: "Moderation" }]} />
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

  // Render dashboard (user is loaded and has proper permissions)
  if (!user) {
    // This shouldn't happen given the guards above, but TypeScript needs it
    return null;
  }

  return (
    <ContentPage>
      <ContentPage.Header
        title="Moderation Dashboard"
        breadcrumbs={[{ label: "Moderation" }]}
        actions={
          <div className="flex items-center gap-2">
            <Badge size="sm" shape="pill" variant={user.role === "admin" ? "error" : "info"}>
              {user.role === "admin" ? "Admin" : "Moderator"}
            </Badge>
            {user.role === "admin" && (
              <Button variant="secondary" size="sm" href="/mod/users">
                <Icon name="Users" size={14} />
                Manage Users
              </Button>
            )}
            <Button variant="secondary" size="sm" href="/contributions">
              View All Contributions
            </Button>
          </div>
        }
      />
      <ContentPage.Body>
        <div className="px-4 sm:px-6 space-y-6">
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
      </ContentPage.Body>
    </ContentPage>
  );
}
