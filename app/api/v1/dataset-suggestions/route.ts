/**
 * POST /api/v1/dataset-suggestions — Suggest a new dataset for CommonGrid
 *
 * PUBLIC endpoint: no Clerk auth. Anonymous visitors can propose a dataset
 * they think belongs in the connected graph. This is a notification, not a
 * stored entity — a valid submission fans out to moderators via Knock and
 * nothing is persisted.
 *
 * Composed like the contributions route (withErrorHandling → withRequestId →
 * withTiming) rather than through withApiMiddleware, because the shared public
 * middleware is built around API-key auth + usage tracking for the read API.
 * Rate limiting is applied here directly with the "write" tier since this is
 * an unauthenticated mutating endpoint.
 */

import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { checkRateLimit, rateLimitHeaders, rateLimitIdentifier, rateLimitResponse } from "@/lib/api/rate-limit";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema/users";
import { isKnockConfigured } from "@/lib/knock/client";
import type { ModDatasetSuggestionData } from "@/lib/knock/types";
import { triggerModDatasetSuggestion } from "@/lib/knock/workflows";

// ---------------------------------------------------------------------------
// Constants / validation helpers
// ---------------------------------------------------------------------------

/**
 * Pragmatic email shape check — a single `@` with a dotted domain. Full RFC
 * 5322 validation is not worth it for a contact field; the address is only
 * ever used for a moderator to reply, so "looks like an email" is enough.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guardrails so a single request cannot ship an unbounded email body. */
const MAX_SHORT = 200;
const MAX_LONG = 5000;

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError("VALIDATION_ERROR", `${field} is required.`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ApiError("VALIDATION_ERROR", `${field} must be at most ${max} characters.`, { field });
  }
  return trimmed;
}

function optionalString(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError("VALIDATION_ERROR", `${field} must be a string.`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ApiError("VALIDATION_ERROR", `${field} must be at most ${max} characters.`, { field });
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// POST /api/v1/dataset-suggestions
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  // --- Rate limit (anonymous write) ---
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const identifier = rateLimitIdentifier({ isAuthenticated: false, apiKeyId: null, ip });
  const rl = await checkRateLimit(identifier, false, true, false);
  if (!rl.success) {
    return rateLimitResponse(rl, ctx.requestId);
  }

  // --- Parse + validate body ---
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("VALIDATION_ERROR", "Request body must be a JSON object.");
  }

  const submitterEmail = requireString(body.submitterEmail, "submitterEmail", MAX_SHORT);
  if (!EMAIL_RE.test(submitterEmail)) {
    throw new ApiError("VALIDATION_ERROR", "submitterEmail must be a valid email address.", {
      field: "submitterEmail",
    });
  }

  const submitterName = optionalString(body.submitterName, "submitterName", MAX_SHORT);
  const datasetName = requireString(body.datasetName, "datasetName", MAX_SHORT);
  const dataDescription = requireString(body.dataDescription, "dataDescription", MAX_LONG);
  const usefulness = requireString(body.usefulness, "usefulness", MAX_LONG);
  const source = optionalString(body.source, "source", MAX_LONG);

  if (typeof body.willingToModerate !== "boolean") {
    throw new ApiError("VALIDATION_ERROR", "willingToModerate is required and must be a boolean.", {
      field: "willingToModerate",
    });
  }
  const willingToModerate = body.willingToModerate;

  const suggestion: ModDatasetSuggestionData = {
    submitterEmail,
    submitterName,
    datasetName,
    dataDescription,
    usefulness,
    source,
    willingToModerate,
  };

  // --- Notify moderators (fire-and-forget) ---
  // This is a notification, not a stored entity: nothing is persisted. If Knock
  // is unconfigured (local dev, CI) we simply accept the submission — a Knock
  // outage must never block the 200.
  if (isKnockConfigured()) {
    const db = getDb();
    const moderators = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.role} IN ('moderator', 'admin')`);

    const moderatorIds = moderators.map((m) => m.id);

    if (moderatorIds.length > 0) {
      void triggerModDatasetSuggestion(moderatorIds, suggestion);
    }
  }

  return jsonResponse({ data: { received: true } }, 200, {
    ...corsHeaders(),
    ...rateLimitHeaders(rl),
    "X-Request-Id": ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: generateRequestId() });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
