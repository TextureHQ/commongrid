/**
 * Authentication helpers for CommonGrid.
 *
 * Bridges Clerk's auth session with our local users table.
 * Use `getCurrentUser()` in server components and API routes
 * to get the full CommonGrid user profile.
 *
 * Dev mode: set DEV_AUTH_BYPASS=<clerk_user_id> in .env.local
 * to skip Clerk auth and return the matching local user directly.
 * Only works when NODE_ENV !== "production".
 *
 * ERD Reference: §9 Clerk Integration — Session Validation
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { UserSelect } from "@/lib/db/schema/users";
import { users } from "@/lib/db/schema/users";

/**
 * Dev-mode auth bypass: when DEV_AUTH_BYPASS is set to a Clerk user ID,
 * return that user from the local DB without hitting Clerk.
 * Only enabled when NODE_ENV is not "production".
 */
async function getDevBypassUser(): Promise<UserSelect | null> {
  if (process.env.NODE_ENV === "production") return null;
  const bypassId = process.env.DEV_AUTH_BYPASS;
  if (!bypassId) return null;

  const db = getDb();
  const result = await db.select().from(users).where(eq(users.clerkUserId, bypassId)).limit(1);
  return result[0] ?? null;
}

/**
 * Get the current user's Clerk userId (or null if not signed in).
 */
export async function getClerkUserId(): Promise<string | null> {
  const devUser = await getDevBypassUser();
  if (devUser) return devUser.clerkUserId;

  const { userId } = await auth();
  return userId;
}

/**
 * Get the current user's CommonGrid profile from our database.
 * Returns null if not signed in or user record doesn't exist yet
 * (webhook may not have fired yet).
 */
export async function getCurrentUser(): Promise<UserSelect | null> {
  const devUser = await getDevBypassUser();
  if (devUser) return devUser;

  const clerkUserId = await getClerkUserId();
  if (!clerkUserId) return null;

  const db = getDb();
  const result = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);

  return result[0] ?? null;
}

/**
 * Get the current user's CommonGrid profile, throwing if not authenticated.
 * Use in protected API routes where auth is required.
 */
export async function requireCurrentUser(): Promise<UserSelect> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

/**
 * Ensure the current user's Clerk profile is synced to our DB.
 * Called as a fallback when the webhook hasn't fired yet
 * (e.g., first page load after sign-up before webhook arrives).
 */
export async function ensureUserSynced(): Promise<UserSelect | null> {
  const clerkUserId = await getClerkUserId();
  if (!clerkUserId) return null;

  const db = getDb();

  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);

  if (existing[0]) return existing[0];

  // User doesn't exist yet — create from Clerk data
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || "Anonymous";

  const [newUser] = await db
    .insert(users)
    .values({
      clerkUserId: clerkUser.id,
      displayName,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? null,
      avatarUrl: clerkUser.imageUrl,
    })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();

  return newUser ?? null;
}
