import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { reportError } from "@/lib/observability";

/**
 * GET /api/v1/mod/users
 *
 * Returns all users with their stats. Admin-only.
 */
export async function GET(_request: NextRequest) {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();

    // Get the current user to check if they're an admin
    const [currentUser] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);

    if (!currentUser || currentUser.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    // Fetch all users with their stats
    const allUsers = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        affiliation: users.affiliation,
        role: users.role,
        contributionCount: users.contributionCount,
        approvedCount: users.approvedCount,
        returnedCount: users.returnedCount,
        trustedPromotedAt: users.trustedPromotedAt,
        createdAt: users.createdAt,
        lastActiveAt: users.lastActiveAt,
        bannedAt: users.bannedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    // Calculate trust level for each user
    const usersWithTrustLevel = allUsers.map((user) => {
      let trustLevel = "New";
      if (user.role === "admin") {
        trustLevel = "Admin";
      } else if (user.role === "moderator") {
        trustLevel = "Moderator";
      } else if (user.role === "trusted_contributor") {
        trustLevel = "Trusted";
      } else if (user.contributionCount > 10 && user.approvedCount > 5) {
        trustLevel = "Active";
      } else if (user.contributionCount > 0) {
        trustLevel = "Contributor";
      }

      return {
        ...user,
        trustLevel,
      };
    });

    return NextResponse.json({ data: usersWithTrustLevel });
  } catch (error) {
    reportError(error, { scope: "api.mod.users.list" });
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
