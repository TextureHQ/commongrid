/**
 * GET /api/v1/utilities/{slug}/confirmations — fields staff at this utility
 * have confirmed are still right.
 *
 * Public and read-only. Lists only fields whose current value was confirmed
 * (the utility's website, a co-op's power supplier, the status of programs it
 * runs), so an unconfirmed or since-changed field is simply absent. Says which
 * utility and when, never who: no user id, name, email or email domain.
 *
 * Confirming is a separate, signed-in surface: /api/v1/confirmations/{slug}.
 */

import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { publicConfirmations } from "@/lib/confirmations/record";
import { loadRecord } from "@/lib/confirmations/store";

async function handleGet(_req: Request, ctx: RouteContext) {
  const slug = ctx.params?.slug;
  if (!slug) throw new ApiError("BAD_REQUEST", "Missing slug parameter");
  const record = await loadRecord(slug);
  if (!record) throw new ApiError("NOT_FOUND", `Utility '${slug}' not found`);

  return jsonResponse(
    { data: { confirmedBy: record.utility.confirmerName, confirmations: publicConfirmations(record.rows) } },
    200,
    {
      // Short, so a new confirmation shows within a minute or two. Pages also
      // compare `value` with what they display, so a cached entry can't sit
      // beside a value that has changed.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      "Cache-Tag": `utility:${slug}:confirmations`,
      ...corsHeaders(),
    }
  );
}

const handler = withRequestId(withErrorHandling(withTiming(handleGet)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handler(req, { requestId: generateRequestId(), params: { slug } });
}
