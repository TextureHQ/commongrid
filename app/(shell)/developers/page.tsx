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
  DialogTrigger,
  Form,
  Heading,
  Icon,
  Kpi,
  KpiGroup,
  Loader,
  PageLayout,
  Select,
  TextField,
} from "@texturehq/edges";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export default function DevelopersPage() {
  const { isLoaded, isSignedIn } = useAuth();

  const router = useRouter();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
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

  // Fetch data
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
      errors.app_name = "Application name is required.";
    }
    if (!formData.use_case) {
      errors.use_case = "Please select a use case.";
    }
    if (!formData.description.trim()) {
      errors.description = "Description is required.";
    } else if (formData.description.trim().length < 10) {
      errors.description = `Description must be at least 10 characters (currently ${formData.description.trim().length}).`;
    }
    return errors;
  }

  // Handle create key
  async function handleCreateKey() {
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

  // Redirect to sign in if not authenticated
  if (isLoaded && !isSignedIn) {
    router.push("/sign-in?redirect=/developers");
    return null;
  }

  if (!isLoaded || loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader size={32} />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <Banner variant="error" title="Error loading dashboard">
          {error}
        </Banner>
      </PageLayout>
    );
  }

  const tierInfo = {
    anonymous: { limit: "60/hr", label: "Anonymous" },
    registered: { limit: "5,000/hr", label: "Registered" },
    bulk: { limit: "50,000/hr", label: "Bulk" },
  };

  const currentTier = keys.find((k) => k.isActive)?.tier || "anonymous";

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <Heading tag="h1" size="xl">
            Developer Dashboard
          </Heading>
          <p className="text-text-muted text-base mt-2">
            Manage your API keys, monitor usage, and explore the CommonGrid API.
          </p>
        </div>

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
              <DialogTrigger
                isOpen={isDialogOpen}
                onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (open) setNewKey(null);
                }}
              >
                <Button variant="primary" size="sm" icon="Plus" onPress={() => setIsDialogOpen(true)}>
                  Create API Key
                </Button>
                <Dialog title="Create API Key">
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
                          isInvalid={!!fieldErrors.app_name}
                          errorMessage={fieldErrors.app_name}
                        />
                        <TextField
                          label="Application URL"
                          placeholder="https://myapp.com"
                          value={formData.app_url}
                          onChange={(value) => setFormData({ ...formData, app_url: value })}
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
                          selectedKey={formData.use_case || undefined}
                          onSelectionChange={(key) => {
                            setFormData({ ...formData, use_case: key as string });
                            if (fieldErrors.use_case) setFieldErrors((prev) => ({ ...prev, use_case: "" }));
                          }}
                          isRequired
                          isInvalid={!!fieldErrors.use_case}
                          errorMessage={fieldErrors.use_case}
                          useMobileTray={false}
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
                          isInvalid={!!fieldErrors.description}
                          errorMessage={fieldErrors.description}
                          description="Minimum 10 characters"
                        />
                        {createError && (
                          <Banner variant="error" title="Error">
                            {createError}
                          </Banner>
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button variant="primary" onPress={handleCreateKey} isDisabled={isCreating}>
                            {isCreating ? "Creating..." : "Create Key"}
                          </Button>
                        </div>
                      </Form>
                    )}
                  </div>
                </Dialog>
              </DialogTrigger>
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
                      <span className="text-sm font-medium text-text-heading">
                        {day.count.toLocaleString()} requests
                      </span>
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

        {/* Rate Limits */}
        <Card>
          <CardHeader title="Rate Limits" subtitle="Your current tier and request limits" />
          <CardContent>
            <div className="space-y-6">
              {isSignedIn && !keys.find((k) => k.isActive) && (
                <Banner variant="info" title="No API key yet">
                  You are registered but have not created an API key yet. Create an API key to unlock the Registered
                  tier (5,000 requests/hr).{" "}
                  <button
                    type="button"
                    onClick={() => setIsDialogOpen(true)}
                    className="underline font-medium hover:opacity-80"
                  >
                    Create API Key
                  </button>
                </Banner>
              )}
              <div className="p-4 bg-brand-light/10 border border-brand-light rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-text-heading">Current Tier</span>
                  <Badge variant="info" size="lg">
                    {tierInfo[currentTier as keyof typeof tierInfo]?.label || currentTier}
                  </Badge>
                </div>
                <p className="text-sm text-text-muted">
                  Rate limit: <strong>{tierInfo[currentTier as keyof typeof tierInfo]?.limit}</strong>
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 border border-border-default rounded-lg">
                  <Icon name="CheckCircle" className="text-feedback-success flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-text-heading">Anonymous (60/hr)</div>
                    <p className="text-sm text-text-muted">
                      No authentication required. Great for testing and small projects.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 border border-brand-light rounded-lg bg-brand-light/5">
                  <Icon name="CheckCircle" className="text-brand-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-text-heading">Registered (5,000/hr)</div>
                    <p className="text-sm text-text-muted">
                      Free tier with API key authentication. Ideal for most applications.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 border border-border-default rounded-lg">
                  <Icon name="Lightning" className="text-feedback-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium text-text-heading">Bulk (50,000/hr)</div>
                    <p className="text-sm text-text-muted">
                      For high-volume integrations. Contact us to request bulk access.
                    </p>
                  </div>
                </div>
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
    </PageLayout>
  );
}
