/**
 * useCurrentUser — Client hook for fetching the current user's profile
 *
 * Uses SWR to fetch from /api/v1/me.
 * Only fetches when Clerk isSignedIn is true.
 * Returns { user, isLoading, error, mutate }
 */

import { useAuth } from "@clerk/nextjs";
import useSWR from "swr";

interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: "contributor" | "trusted_contributor" | "moderator" | "admin";
  contributionCount: number;
  approvedCount: number;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<CurrentUser> => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Not authenticated");
    }
    throw new Error(`Failed to fetch user: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
};

export function useCurrentUser(): UseCurrentUserResult {
  const { isSignedIn, isLoaded } = useAuth();

  // Only fetch if user is signed in
  const { data, error, mutate } = useSWR<CurrentUser>(isLoaded && isSignedIn ? "/api/v1/me" : null, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Cache for 5 minutes
    dedupingInterval: 300_000,
  });

  return {
    user: data ?? null,
    isLoading: isLoaded && isSignedIn && !data && !error,
    error: error ?? null,
    mutate,
  };
}
