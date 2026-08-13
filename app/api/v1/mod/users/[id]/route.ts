import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { reportError } from "@/lib/observability";

/**
 * PATCH /api/v1/mod/users/[id]
 *
 * Update a user's role. Admin-only.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

    const body = await request.json();
    const { role } = body;

    // Validate role
    const validRoles = ["contributor", "trusted_contributor", "moderator", "admin"];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }

    // Update the user's role
    const updateData: Record<string, unknown> = {
      role,
      updatedAt: new Date(),
    };

    // If promoting to trusted_contributor, set the promotion timestamp
    if (role === "trusted_contributor") {
      updateData.trustedPromotedAt = new Date();
      updateData.trustedPromotedBy = currentUser.id;
    }

    const updated = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ data: updated[0] });
  } catch (error) {
    reportError(error, { scope: "api.mod.users.update" });
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
