/**
 * GET /api/v1/me — Current User Profile
 *
 * Returns the current user's CommonGrid profile from the database.
 * If authenticated but no DB record exists yet (e.g., webhook hasn't fired),
 * calls ensureUserSynced() to create the record.
 *
 * Response includes:
 *   - id, displayName, email, avatarUrl
 *   - role (contributor | trusted_contributor | moderator | admin)
 *   - contributionCount, approvedCount
 *
 * Requires authentication via Clerk.
 */

import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { ensureUserSynced, getCurrentUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  // Check if user is authenticated
  let user = await getCurrentUser();

  // If no user record exists yet, sync from Clerk
  if (!user) {
    user = await ensureUserSynced();
  }

  // If still no user, they're not authenticated
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Authentication required.");
  }

  return jsonResponse(
    {
      data: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        contributionCount: user.contributionCount,
        approvedCount: user.approvedCount,
      },
    },
    200,
    {
      ...corsHeaders(),
      "X-Request-Id": ctx.requestId,
      // Cache for a short time to avoid re-fetching on every render
      "Cache-Control": "private, max-age=60",
    }
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}
