"use client";

import { SignInButton } from "@clerk/nextjs";
import { Avatar, Badge, Button, Card, type Column, DataTable, Icon, Loader, PageLayout } from "@texturehq/edges";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User extends Record<string, unknown> {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  affiliation: string | null;
  role: string;
  contributionCount: number;
  approvedCount: number;
  returnedCount: number;
  trustLevel: string;
  createdAt: string;
  lastActiveAt: string | null;
  bannedAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UserManagementPage() {
  const { user: currentUser, isLoading: userLoading } = useCurrentUser();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Fetch users
  useEffect(() => {
    if (!currentUser) return;

    fetch("/api/v1/mod/users")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch users");
        return res.json();
      })
      .then((json) => {
        setUsers(json.data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [currentUser]);

  // Handle role change
  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    setUpdatingUserId(userId);
    try {
      const res = await fetch(`/api/v1/mod/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to update user");
      }

      // Update the user in the local state
      setUsers((prevUsers) => prevUsers.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setUpdatingUserId(null);
    }
  }, []);

  // Filter users by search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const lower = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(lower) ||
        u.email?.toLowerCase().includes(lower) ||
        u.affiliation?.toLowerCase().includes(lower)
    );
  }, [users, searchQuery]);

  // Define table columns
  const columns: Column<User>[] = useMemo(
    () => [
      {
        id: "user",
        label: "User",
        accessor: "displayName",
        render: (_value: unknown, row: User) => (
          <div className="flex items-center gap-3 py-1">
            <Avatar
              src={row.avatarUrl ?? undefined}
              fullName={row.displayName}
              size="sm"
              shape="circle"
              variant="user"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-body">{row.displayName}</span>
              {row.email && <span className="text-xs text-text-muted">{row.email}</span>}
            </div>
          </div>
        ),
        mobile: { priority: 1, format: "primary" },
      },
      {
        id: "affiliation",
        label: "Affiliation",
        accessor: "affiliation",
        render: (_value: unknown, row: User) => (
          <span className="text-sm text-text-body">{row.affiliation ?? "—"}</span>
        ),
        mobile: false,
      },
      {
        id: "role",
        label: "Role",
        accessor: "role",
        render: (_value: unknown, row: User) => (
          <select
            value={row.role}
            onChange={(e) => handleRoleChange(row.id, e.target.value)}
            disabled={updatingUserId === row.id}
            className="text-sm rounded-md border border-border-default bg-background-body px-2 py-1 text-text-body focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
          >
            <option value="contributor">Contributor</option>
            <option value="trusted_contributor">Trusted Contributor</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
          </select>
        ),
        mobile: { priority: 2, format: "badge" },
      },
      {
        id: "contributions",
        label: "Contributions",
        accessor: "contributionCount",
        render: (_value: unknown, row: User) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text-body">{row.contributionCount}</span>
            <span className="text-xs text-text-muted">
              {row.approvedCount} approved · {row.returnedCount} returned
            </span>
          </div>
        ),
        mobile: false,
      },
      {
        id: "trustLevel",
        label: "Trust Level",
        accessor: "trustLevel",
        render: (_value: unknown, row: User) => (
          <Badge size="sm" shape="pill" variant="default">
            {row.trustLevel}
          </Badge>
        ),
        mobile: false,
      },
      {
        id: "createdAt",
        label: "Joined",
        accessor: "createdAt",
        render: (_value: unknown, row: User) => (
          <span className="text-sm text-text-muted">{formatDate(row.createdAt)}</span>
        ),
        mobile: false,
      },
    ],
    [handleRoleChange, updatingUserId]
  );

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
  if (!currentUser) {
    return (
      <PageLayout maxWidth={1200}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Icon name="ShieldCheck" size={48} className="text-text-muted" />
          <h1 className="text-2xl font-semibold text-text-heading">Authentication Required</h1>
          <p className="text-text-muted">Please sign in to access user management.</p>
          <SignInButton mode="modal">
            <Button variant="primary">Sign In</Button>
          </SignInButton>
        </div>
      </PageLayout>
    );
  }

  // Show access denied if not admin
  if (currentUser.role !== "admin") {
    return (
      <PageLayout maxWidth={1200}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Icon name="ShieldSlash" size={48} className="text-text-muted" />
          <h1 className="text-2xl font-semibold text-text-heading">Access Denied</h1>
          <p className="text-text-muted">You need admin privileges to access user management.</p>
          <Button variant="secondary" href="/mod">
            Go to Moderation Dashboard
          </Button>
        </div>
      </PageLayout>
    );
  }

  // Render user management page
  return (
    <PageLayout maxWidth={1200}>
      <div className="py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="Users" size={28} className="text-text-heading" />
            <h1 className="text-3xl font-semibold text-text-heading">User Management</h1>
            <Badge size="sm" shape="pill" variant="info">
              {users.length} users
            </Badge>
          </div>
          <Button variant="secondary" href="/mod">
            <Icon name="ArrowLeft" size="sm" />
            Back to Dashboard
          </Button>
        </div>

        {/* Search */}
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <Icon name="MagnifyingGlass" size="sm" className="text-text-muted" />
              <input
                type="text"
                placeholder="Search by name, email, or affiliation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border-none bg-transparent text-sm text-text-body placeholder:text-text-muted focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-text-muted hover:text-text-body transition-colors"
                >
                  <Icon name="X" size="sm" />
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Users Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={32} />
          </div>
        ) : error ? (
          <Card variant="outlined">
            <div className="p-6 text-center">
              <Icon name="Warning" size={32} className="text-feedback-error mx-auto mb-3" />
              <p className="text-sm font-medium text-feedback-error">{error}</p>
            </div>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <DataTable data={filteredUsers} columns={columns} mobileBreakpoint="md" isLoading={false} />
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
