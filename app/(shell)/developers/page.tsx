"use client";

import { useAuth } from "@clerk/nextjs";
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CopyToClipboard,
  Dialog,
  Form,
  Icon,
  Kpi,
  KpiGroup,
  Loader,
  Select,
  TextField,
} from "@texturehq/edges";
import { useEffect, useState } from "react";
import { ContentPage } from "@/components/ContentPage";
import { DEVELOPER_TIERS, DEVELOPER_TIERS_BY_ID, resolveCurrentTier } from "@/lib/api/developer-tiers";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  tier: string;
  lastUsedAt: string | null;
  createdAt: string;
  isActive: boolean;
};

type UsageData = {
  period: string;
  totalRequests: number;
  avgResponseTimeMs: number;
  byEndpoint: { endpoint: string; count: number }[];
  byDay: { date: string; count: number }[];
  byStatusCode: { statusCode: number; count: number }[];
};

type DashboardStats = {
  period: string;
  totalRequests: number;
  avgDailyRequests: number;
  mostUsedEndpoint: { endpoint: string; count: number } | null;
  p95ResponseTimeMs: number;
  avgResponseTimeMs: number;
  activeKeyCount: number;
  totalKeyCount: number;
};

const CURL_EXAMPLE = `curl https://commongrid.info/api/v1/utilities`;

export default function DevelopersPage() {
  const { isLoaded, isSignedIn } = useAuth();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Create key form state
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    app_name: "",
    app_url: "",
    use_case: "",
    description: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Fetch signed-in dashboard data only. Anonymous visitors never hit these
  // endpoints and see the public overview immediately.
  useEffect(() => {
    if (!isSignedIn) return;

    async function fetchData() {
      try {
        setLoading(true);
        const [keysRes, usageRes, statsRes] = await Promise.all([
          fetch("/api/v1/developer/keys"),
          fetch("/api/v1/developer/usage?period=30d"),
          fetch("/api/v1/developer/stats"),
        ]);

        if (!keysRes.ok || !usageRes.ok || !statsRes.ok) {
          throw new Error("Failed to fetch dashboard data");
        }

        const [keysData, usageData, statsData] = await Promise.all([keysRes.json(), usageRes.json(), statsRes.json()]);

        setKeys(keysData.data);
        setUsage(usageData.data);
        setStats(statsData.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isSignedIn]);

  // Validate form and return errors object (empty = valid)
  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!formData.app_name.trim()) {
      errors.app_name = "Application name is required";
    }
    if (!formData.use_case) {
      errors.use_case = "Use case is required. Please select an option from the dropdown";
    }
    const descLength = formData.description.trim().length;
    if (descLength === 0) {
      errors.description = "Description is required";
    } else if (descLength < 10) {
      errors.description = `Description must be at least 10 characters. You have ${descLength}, need ${10 - descLength} more`;
    }
    return errors;
  }

  // Handle create key
  async function handleCreateKey() {
    setAttemptedSubmit(true);
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/v1/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to create API key");
      }

      const data = await res.json();
      setNewKey(data.data.key);
      setKeys([data.data, ...keys]);
      setFormData({
        name: "",
        app_name: "",
        app_url: "",
        use_case: "",
        description: "",
      });
      setFieldErrors({});
      setAttemptedSubmit(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsCreating(false);
    }
  }

  // Handle revoke key
  async function handleRevokeKey(keyId: string) {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/developer/keys/${keyId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to revoke API key");
      }

      setKeys(keys.filter((k) => k.id !== keyId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "An error occurred");
    }
  }

  const currentTier = resolveCurrentTier(keys);
  const descriptionCharCount = formData.description.trim().length;

  // Public overview — always rendered, including for signed-out visitors.
  const publicOverview = (
    <div className="space-y-8">
      {/* Intro */}
      <Card>
        <CardHeader
          title="Build on the CommonGrid API"
          subtitle="An open REST API for U.S. electric grid data — utilities, power plants, transmission, pricing nodes, and more."
        />
        <CardContent>
          <div className="space-y-4 text-sm text-text-body">
            <p>
              The CommonGrid API is <strong>free and open</strong>. You can start querying public endpoints right away —{" "}
              <strong>no account or API key required</strong>. API keys are optional and only exist to unlock{" "}
              <strong>higher rate limits</strong>; the data you can reach is the same either way.
            </p>
            <p>Try it now — this returns a paginated list of U.S. utilities as JSON, no authentication needed:</p>
            <div className="bg-background-muted p-4 rounded-lg">
              <CopyToClipboard value={CURL_EXAMPLE}>
                <code className="text-sm font-mono break-all">{CURL_EXAMPLE}</code>
              </CopyToClipboard>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="primary" icon="ArrowRight" href="/api">
                Explore the API reference
              </Button>
              {isLoaded && !isSignedIn && (
                <Button variant="secondary" href="/sign-in?redirect=/developers">
                  Sign in to manage API keys
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rate limit tiers */}
      <Card>
        <CardHeader title="Rate limits" subtitle="API keys buy higher limits — not extra data or access." />
        <CardContent>
          <div className="space-y-6">
            <div className="p-4 bg-brand-light/10 border border-brand-light rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-heading">Your current tier</span>
                <Badge variant="info" size="lg">
                  {DEVELOPER_TIERS_BY_ID[currentTier]?.label ?? currentTier}
                </Badge>
              </div>
              <p className="text-sm text-text-muted">
                Rate limit: <strong>{DEVELOPER_TIERS_BY_ID[currentTier]?.limit}</strong>
                {!isSignedIn && " — sign in and create a key to raise this."}
              </p>
            </div>

            <div className="space-y-3">
              {DEVELOPER_TIERS.map((tier) => {
                const isCurrent = tier.id === currentTier;
                return (
                  <div
                    key={tier.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg ${
                      isCurrent ? "border-brand-light bg-brand-light/5" : "border-border-default"
                    }`}
                  >
                    <Icon
                      name={tier.id === "bulk" ? "Lightning" : "CheckCircle"}
                      className={`flex-shrink-0 mt-0.5 ${
                        tier.id === "bulk"
                          ? "text-feedback-warning"
                          : tier.id === "registered"
                            ? "text-brand-primary"
                            : "text-feedback-success"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-text-heading">
                        {tier.label} ({tier.limit})
                      </div>
                      <p className="text-sm text-text-muted">{tier.description}</p>
                    </div>
                    {isCurrent && <Badge variant="info">Current</Badge>}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-border-default">
              <p className="text-sm text-text-muted">
                Need higher limits?{" "}
                <a href="mailto:hello@texturehq.com" className="text-brand-primary hover:underline">
                  Contact us
                </a>{" "}
                to discuss bulk access options.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Documentation Link */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-text-heading mb-1">API Documentation</h3>
              <p className="text-sm text-text-muted">
                Explore endpoints, request/response formats, and integration guides
              </p>
            </div>
            <Button variant="secondary" icon="ArrowRight" href="/api">
              View Docs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Signed-in key management + usage. Only rendered for authenticated users.
  const signedInDashboard = (
    <div className="space-y-8">
      {/* Stats Overview */}
      {stats && (
        <KpiGroup>
          <Kpi label="Total Requests (30d)" value={stats.totalRequests} formatter={{ type: "number" }} />
          <Kpi label="Avg Daily Requests" value={stats.avgDailyRequests} formatter={{ type: "number" }} />
          <Kpi label="P95 Response Time (ms)" value={stats.p95ResponseTimeMs} formatter={{ type: "number" }} />
          <Kpi label="Active API Keys" value={stats.activeKeyCount} formatter={{ type: "number" }} />
        </KpiGroup>
      )}

      {/* API Keys Section */}
      <Card>
        <CardHeader
          title="API Keys"
          subtitle="Create and manage API keys for your applications"
          actions={
            <Button
              variant="primary"
              size="sm"
              icon="Plus"
              onPress={() => {
                setIsDialogOpen(true);
                setNewKey(null);
              }}
            >
              Create API Key
            </Button>
          }
        />
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <Icon name="Key" size="lg" className="mx-auto mb-4 text-text-caption" />
              <p>No API keys yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border border-border-default rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-text-heading">{key.name}</span>
                      <Badge variant={key.isActive ? "success" : "neutral"}>
                        {key.isActive ? "Active" : "Revoked"}
                      </Badge>
                      <Badge variant="info">{key.tier}</Badge>
                    </div>
                    <div className="text-sm text-text-muted space-y-1">
                      <CopyToClipboard value={key.keyPrefix}>
                        <code className="font-mono">{key.keyPrefix}...</code>
                      </CopyToClipboard>
                      <div className="flex gap-4">
                        <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                        {key.lastUsedAt && <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  {key.isActive && (
                    <Button variant="destructive" size="sm" onPress={() => handleRevokeKey(key.id)}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog — controlled mode, rendered outside Card to avoid z-index/popover conflicts */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setAttemptedSubmit(false);
          setFieldErrors({});
          setCreateError(null);
        }}
        title="Create API Key"
      >
        <div className="space-y-4">
          {newKey ? (
            <div className="space-y-4">
              <Banner variant="success" title="API Key Created">
                Store this key securely. It will not be shown again.
              </Banner>
              <div className="bg-background-muted p-4 rounded-lg">
                <CopyToClipboard value={newKey}>
                  <code className="text-sm font-mono break-all">{newKey}</code>
                </CopyToClipboard>
              </div>
              <Button
                variant="primary"
                onPress={() => {
                  setNewKey(null);
                  setIsDialogOpen(false);
                }}
                className="w-full"
              >
                Done
              </Button>
            </div>
          ) : (
            <Form>
              <TextField
                label="Key Name"
                placeholder="My App API Key"
                value={formData.name}
                onChange={(value) => setFormData({ ...formData, name: value })}
                description="Optional: Give this key a friendly name for reference"
              />
              <TextField
                label="Application Name"
                placeholder="My Application"
                value={formData.app_name}
                onChange={(value) => {
                  setFormData({ ...formData, app_name: value });
                  if (fieldErrors.app_name) setFieldErrors((prev) => ({ ...prev, app_name: "" }));
                }}
                isRequired
                isInvalid={attemptedSubmit && !!fieldErrors.app_name}
                errorMessage={attemptedSubmit ? fieldErrors.app_name : undefined}
              />
              <TextField
                label="Application URL"
                placeholder="https://myapp.com"
                value={formData.app_url}
                onChange={(value) => setFormData({ ...formData, app_url: value })}
                description="Optional: The URL where you'll use this API key"
              />
              <Select
                label="Use Case"
                placeholder="Select a use case"
                items={[
                  { id: "research", label: "Research", value: "research" },
                  { id: "commercial", label: "Commercial", value: "commercial" },
                  { id: "nonprofit", label: "Nonprofit", value: "nonprofit" },
                  { id: "government", label: "Government", value: "government" },
                  { id: "education", label: "Education", value: "education" },
                  { id: "personal", label: "Personal", value: "personal" },
                  { id: "other", label: "Other", value: "other" },
                ]}
                renderItem={(item) => item.label}
                selectedKey={formData.use_case || undefined}
                onSelectionChange={(key) => {
                  setFormData({ ...formData, use_case: key as string });
                  if (fieldErrors.use_case) setFieldErrors((prev) => ({ ...prev, use_case: "" }));
                }}
                isRequired
                isInvalid={attemptedSubmit && !!fieldErrors.use_case}
                errorMessage={attemptedSubmit ? fieldErrors.use_case : undefined}
              />
              <TextField
                label="Description"
                placeholder="Describe how you'll use the API"
                value={formData.description}
                onChange={(value) => {
                  setFormData({ ...formData, description: value });
                  if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: "" }));
                }}
                isRequired
                isInvalid={attemptedSubmit && !!fieldErrors.description}
                errorMessage={attemptedSubmit ? fieldErrors.description : undefined}
                description={`${descriptionCharCount} characters (${descriptionCharCount < 10 ? "minimum 10 required" : "ready to submit"})`}
              />
              {createError && (
                <Banner variant="error" title="Error">
                  {createError}
                </Banner>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onPress={() => setIsDialogOpen(false)} isDisabled={isCreating}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={handleCreateKey} isLoading={isCreating}>
                  Create Key
                </Button>
              </div>
            </Form>
          )}
        </div>
      </Dialog>

      {/* No-key prompt */}
      {!keys.find((k) => k.isActive) && (
        <Banner variant="info" title="No API key yet">
          You are registered but have not created an API key yet. Create an API key to unlock the Registered tier (5,000
          requests/hr).{" "}
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="underline font-medium hover:opacity-80"
          >
            Create API Key
          </button>
        </Banner>
      )}

      {/* Usage Chart */}
      {usage && usage.totalRequests > 0 && (
        <Card>
          <CardHeader title="API Usage (Last 30 Days)" subtitle="Daily request volume over the past month" />
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {usage.byDay
                .slice(-14)
                .reverse()
                .map((day) => (
                  <div
                    key={day.date}
                    className="flex items-center justify-between py-2 px-3 bg-background-muted rounded"
                  >
                    <span className="text-sm text-text-body">{new Date(day.date).toLocaleDateString()}</span>
                    <span className="text-sm font-medium text-text-heading">{day.count.toLocaleString()} requests</span>
                  </div>
                ))}
            </div>

            {/* Endpoint Breakdown */}
            {usage.byEndpoint.length > 0 && (
              <div className="mt-8">
                <h3 className="text-text-heading font-medium mb-4">Top Endpoints</h3>
                <div className="space-y-2">
                  {usage.byEndpoint.slice(0, 5).map((ep) => (
                    <div
                      key={ep.endpoint}
                      className="flex items-center justify-between py-2 px-3 bg-background-muted rounded"
                    >
                      <code className="text-sm font-mono text-text-body">{ep.endpoint}</code>
                      <span className="text-sm text-text-muted">{ep.count.toLocaleString()} requests</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <ContentPage>
      <ContentPage.Header
        title="Developers"
        subtitle="Learn about the CommonGrid API, explore endpoints, and manage your API keys."
      />
      <ContentPage.Body>
        <div className="space-y-8">
          {publicOverview}

          {/* Signed-in key management & usage */}
          {isSignedIn &&
            (loading ? (
              <div className="flex items-center justify-center min-h-[200px]">
                <Loader size={32} />
              </div>
            ) : error ? (
              <Banner variant="error" title="Error loading dashboard">
                {error}
              </Banner>
            ) : (
              signedInDashboard
            ))}
        </div>
      </ContentPage.Body>
    </ContentPage>
  );
}
