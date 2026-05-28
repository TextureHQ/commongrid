/**
 * POST /api/v1/contributions/:id/withdraw — Withdraw own contribution
 *
 * Soft-deletes a contribution by setting status='withdrawn'. The row stays
 * for audit/history but moderators no longer see it in their queue.
 *
 * Allowed for the owner when status is 'pending' or 'changes_requested'.
 */

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { contributions } from "@/lib/db/schema";

const WITHDRAWABLE_STATUSES = ["pending", "changes_requested"] as const;

async function handlePost(_req: Request, ctx: RouteContext) {
  const id = ctx.params?.id;
  if (!id) {
    throw new ApiError("BAD_REQUEST", "Contribution ID is required.");
  }

  const user = await requireCurrentUser();
  const db = getDb();

  const [existing] = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);

  if (!existing) {
    throw new ApiError("NOT_FOUND", `Contribution ${id} not found.`);
  }

  if (existing.userId !== user.id) {
    throw new ApiError("FORBIDDEN", "You can only withdraw your own contributions.");
  }

  if (!WITHDRAWABLE_STATUSES.includes(existing.status as (typeof WITHDRAWABLE_STATUSES)[number])) {
    throw new ApiError(
      "CONFLICT",
      `Cannot withdraw a contribution with status '${existing.status}'. Only ${WITHDRAWABLE_STATUSES.join(" or ")} contributions can be withdrawn.`
    );
  }

  const [updated] = await db
    .update(contributions)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(contributions.id, id))
    .returning();

  return jsonResponse({ data: updated }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return postHandler(req, { requestId: generateRequestId(), params: { id } });
}
