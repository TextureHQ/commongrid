"use client";

import { SignInButton } from "@clerk/nextjs";
import { Badge, Button, Card, Icon, Loader, PageLayout } from "@texturehq/edges";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

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
  sourceCitation: string | null;
  changes: Record<string, { old: unknown; new: unknown }>;
  createdAt: string;
  reviewedAt: string | null;
  moderatorComment: string | null;
  userId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
    version_conflict: { variant: "neutral", label: "Version Conflict" },
  };
  const c = config[status] ?? { variant: "neutral" as const, label: status };
  return (
    <Badge size="sm" shape="pill" variant={c.variant}>
      {c.label}
    </Badge>
  );
}

function formatFieldName(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ModerationReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { user, isLoading: userLoading } = useCurrentUser();

  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/v1/contributions/${id}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Contribution not found");
          throw new Error("Failed to fetch contribution");
        }
        return res.json();
      })
      .then((json) => {
        setContribution(json.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const handleAction = async (action: "approve" | "return" | "request_changes") => {
    if (!contribution) return;

    // Validate comment requirements
    if ((action === "return" || action === "request_changes") && !comment.trim()) {
      setActionError(`A comment is required for '${action}' actions.`);
      return;
    }

    setActionLoading(action);
    setActionError(null);

    try {
      const res = await fetch(`/api/v1/mod/contributions/${contribution.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comment: comment.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(errorData.error?.message || "Failed to submit review");
      }

      const json = await res.json();
      setContribution(json.data);
      setComment("");

      // Redirect back to dashboard after successful action.
      // router.refresh() invalidates the client-side Router Cache so the
      // dashboard remounts and refetches the queue instead of restoring the
      // stale pre-approval list (an approved item lingered until a manual hard
      // refresh — CG-243).
      router.refresh();
      router.push("/mod");
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  // Show loader while user is loading
  if (userLoading || loading) {
    return (
      <PageLayout maxWidth={896}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader />
        </div>
      </PageLayout>
    );
  }

  // Show sign-in prompt if not authenticated
  if (!user) {
    return (
      <PageLayout maxWidth={896}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Icon name="ShieldCheck" size={48} className="text-text-muted" />
          <h1 className="text-2xl font-semibold text-text-heading">Authentication Required</h1>
          <p className="text-text-muted">Please sign in to access this page.</p>
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
      <PageLayout maxWidth={896}>
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

  // Show error state
  if (error || !contribution) {
    return (
      <PageLayout maxWidth={896}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Icon name="XCircle" size={48} className="text-text-error" />
          <h1 className="text-2xl font-semibold text-text-heading">Error</h1>
          <p className="text-text-muted">{error || "Contribution not found"}</p>
          <Button variant="secondary" href="/mod">
            Back to Dashboard
          </Button>
        </div>
      </PageLayout>
    );
  }

  const canReview = contribution.status === "pending" || contribution.status === "changes_requested";

  return (
    <PageLayout maxWidth={896}>
      <div className="py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button variant="icon" href="/mod" aria-label="Back to dashboard">
                <Icon name="ArrowLeft" size={20} />
              </Button>
              <h1 className="text-3xl font-semibold text-text-heading">Review Contribution</h1>
            </div>
            <div className="flex items-center gap-2">
              <Badge size="sm" shape="pill" variant="neutral">
                {entityTypeLabel(contribution.entityType)}
              </Badge>
              {statusBadge(contribution.status)}
              <span className="text-sm text-text-muted">ID: {contribution.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        {/* Summary */}
        <Card>
          <div className="p-6 space-y-4">
            <div>
              <div className="text-sm font-medium text-text-muted mb-1">Edit Summary</div>
              <div className="text-base text-text-body">{contribution.editSummary || "No summary provided"}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-text-muted mb-1">Source Type</div>
                <div className="text-base text-text-body">{contribution.sourceType.replace(/_/g, " ")}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-text-muted mb-1">Submitted</div>
                <div className="text-base text-text-body">{formatDate(contribution.createdAt)}</div>
              </div>
            </div>

            {contribution.sourceCitation && (
              <div>
                <div className="text-sm font-medium text-text-muted mb-1">Source Citation</div>
                <div className="text-base text-text-body break-words">{contribution.sourceCitation}</div>
              </div>
            )}
          </div>
        </Card>

        {/* Changes */}
        <Card>
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-text-heading">Proposed Changes</h2>

            <div className="space-y-4">
              {Object.entries(contribution.changes).map(([field, change]) => (
                <div key={field} className="border-l-4 border-border-brand pl-4">
                  <div className="text-sm font-medium text-text-heading mb-2">{formatFieldName(field)}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium text-text-muted mb-1">Old Value</div>
                      <div className="text-sm text-text-body p-2 bg-[var(--color-background-subtle)] rounded border border-border-default">
                        <pre className="whitespace-pre-wrap font-mono text-xs">{formatValue(change.old)}</pre>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-text-muted mb-1">New Value</div>
                      <div className="text-sm text-text-body p-2 bg-[var(--color-background-subtle)] rounded border border-border-brand">
                        <pre className="whitespace-pre-wrap font-mono text-xs">{formatValue(change.new)}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Review Actions */}
        {canReview && (
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-semibold text-text-heading">Moderator Review</h2>

              <div>
                <label htmlFor="comment" className="text-sm font-medium text-text-body mb-2 block">
                  Comment {contribution.status === "changes_requested" && "(required for return/reject)"}
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment explaining your decision..."
                  rows={4}
                  className="w-full px-3 py-2 border border-border-default rounded-md bg-[var(--color-background-default)] text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)] focus:border-transparent"
                />
              </div>

              {actionError && (
                <div className="p-3 rounded-md bg-[var(--color-background-error)] border border-[var(--color-border-error)] text-[var(--color-text-error)] text-sm">
                  {actionError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => handleAction("approve")}
                  isDisabled={!!actionLoading}
                  className="flex items-center gap-2"
                >
                  {actionLoading === "approve" ? <Loader size={16} /> : <Icon name="CheckCircle" size={16} />}
                  Approve
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => handleAction("request_changes")}
                  isDisabled={!!actionLoading}
                  className="flex items-center gap-2"
                >
                  {actionLoading === "request_changes" ? (
                    <Loader size={16} />
                  ) : (
                    <Icon name="ArrowBendUpLeft" size={16} />
                  )}
                  Request Changes
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => handleAction("return")}
                  isDisabled={!!actionLoading}
                  className="flex items-center gap-2"
                >
                  {actionLoading === "return" ? <Loader size={16} /> : <Icon name="XCircle" size={16} />}
                  Reject
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Already Reviewed */}
        {!canReview && contribution.reviewedAt && (
          <Card>
            <div className="p-6 space-y-2">
              <div className="flex items-center gap-2">
                <Icon name="CheckCircle" size={20} className="text-text-success" />
                <h2 className="text-xl font-semibold text-text-heading">Already Reviewed</h2>
              </div>
              <div className="text-sm text-text-muted">Reviewed on {formatDate(contribution.reviewedAt)}</div>
              {contribution.moderatorComment && (
                <div className="mt-4 p-3 bg-[var(--color-background-subtle)] rounded border border-border-default">
                  <div className="text-sm font-medium text-text-heading mb-1">Moderator Comment</div>
                  <div className="text-sm text-text-body">{contribution.moderatorComment}</div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
