/**
 * POST /api/v1/notifications/token — Knock in-app feed user token
 *
 * Returns a short-lived, Knock-signed user token for the authenticated user so
 * the client-side KnockProvider can authenticate the in-app feed while Knock is
 * running in enhanced-security mode.
 *
 * The token is an RS256 JWT signed server-side with KNOCK_SIGNING_KEY. The
 * signing key is NEVER sent to the client — only the resulting token, scoped to
 * the current user's id (which is the Knock recipient id, see lib/knock/sync.ts).
 *
 * Requires auth. When Knock signing is not configured (local dev / CI without
 * secrets), it returns { data: { configured: false } } with a 200 so the client
 * can gracefully hide the notification bell instead of surfacing an error.
 */

import { signUserToken } from "@knocklabs/node/lib/tokenSigner";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";

// Token lifetime. Kept short-ish; the client refetches on mount and Knock's
// client SDK will surface auth errors that trigger a re-fetch.
const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

async function handlePost(_req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();

  // KNOCK_SIGNING_KEY is required to mint enhanced-security tokens. Without it
  // the in-app feed can't authenticate; report configured:false (not an error)
  // so the client hides the bell and no Sentry noise is generated.
  if (!process.env.KNOCK_SIGNING_KEY) {
    return jsonResponse({ data: { configured: false } }, 200, {
      ...corsHeaders(),
      "X-Request-Id": ctx.requestId,
      "Cache-Control": "private, no-store",
    });
  }

  // Knock recipient id == CommonGrid user.id (see identifyKnockUser in lib/knock/sync.ts).
  const userToken = await signUserToken(user.id, {
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });

  return jsonResponse(
    {
      data: {
        configured: true,
        userId: user.id,
        userToken,
        expiresInSeconds: TOKEN_TTL_SECONDS,
      },
    },
    200,
    {
      ...corsHeaders(),
      "X-Request-Id": ctx.requestId,
      // Never cache a signed credential in shared caches.
      "Cache-Control": "private, no-store",
    }
  );
}

const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: generateRequestId() });
}
