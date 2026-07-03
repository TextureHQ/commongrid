/**
 * GET  /api/v1/developer/keys — List current user's API keys
 * POST /api/v1/developer/keys — Create a new API key
 *
 * Both endpoints require Clerk authentication.
 *
 * See LDR-63: Enhanced API keys — CRUD endpoints for developer API key management
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { hashApiKey } from "@/lib/api/auth";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ACTIVE_KEYS_PER_USER = 10;

const VALID_USE_CASES = [
  "research",
  "commercial",
  "nonprofit",
  "government",
  "education",
  "personal",
  "other",
] as const;

const VALID_SCOPES = [
  "utilities:read",
  "power_plants:read",
  "ev_stations:read",
  "territories:read",
  "transmission_lines:read",
  "pricing_nodes:read",
  "programs:read",
  "*:read",
] as const;

// ---------------------------------------------------------------------------
// GET /api/v1/developer/keys — List user's API keys
// ---------------------------------------------------------------------------

async function handleGet(_req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      tier: apiKeys.tier,
      appName: apiKeys.appName,
      appUrl: apiKeys.appUrl,
      useCase: apiKeys.useCase,
      description: apiKeys.description,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      lastUsedEndpoint: apiKeys.lastUsedEndpoint,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))
    .orderBy(desc(apiKeys.createdAt));

  return jsonResponse({ data: keys }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// POST /api/v1/developer/keys — Create a new API key
// ---------------------------------------------------------------------------

async function handlePost(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  const db = getDb();

  const body = await req.json();
  const { name, app_name, app_url, use_case, description, scopes: requestedScopes, expires_in_days } = body;

  // --- Validation ---

  if (!app_name || typeof app_name !== "string" || app_name.trim().length === 0) {
    throw new ApiError("VALIDATION_ERROR", "app_name is required.", { field: "app_name" });
  }

  if (!use_case || !VALID_USE_CASES.includes(use_case)) {
    throw new ApiError("VALIDATION_ERROR", `use_case must be one of: ${VALID_USE_CASES.join(", ")}`, {
      field: "use_case",
    });
  }

  if (!description || typeof description !== "string" || description.trim().length < 10) {
    throw new ApiError("VALIDATION_ERROR", "description is required and must be at least 10 characters.", {
      field: "description",
    });
  }

  // Validate scopes if provided
  const scopes = requestedScopes ?? ["*:read"];
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "scopes must be a non-empty array.", { field: "scopes" });
  }
  for (const scope of scopes) {
    if (!VALID_SCOPES.includes(scope as (typeof VALID_SCOPES)[number])) {
      throw new ApiError("VALIDATION_ERROR", `Invalid scope "${scope}". Valid scopes: ${VALID_SCOPES.join(", ")}`, {
        field: "scopes",
      });
    }
  }

  // Check active key count limit
  const activeKeys = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, user.id), eq(apiKeys.isActive, true)));

  if (activeKeys.length >= MAX_ACTIVE_KEYS_PER_USER) {
    throw new ApiError(
      "FORBIDDEN",
      `Maximum of ${MAX_ACTIVE_KEYS_PER_USER} active API keys per user. Revoke an existing key first.`
    );
  }

  // --- Generate key ---

  const rawKey = `cg_${randomUUID()}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 11); // "cg_" + first 8 UUID chars

  const keyName = name ?? `${app_name.trim()} key`;

  let expiresAt: Date | null = null;
  if (expires_in_days && typeof expires_in_days === "number" && expires_in_days > 0) {
    expiresAt = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000);
  }

  const [created] = await db
    .insert(apiKeys)
    .values({
      name: keyName,
      keyHash,
      keyPrefix,
      scopes,
      createdBy: user.id,
      userId: user.id,
      tier: "registered",
      appName: app_name.trim(),
      appUrl: app_url?.trim() || null,
      useCase: use_case,
      description: description.trim(),
      expiresAt,
    })
    .returning();

  return jsonResponse(
    {
      data: {
        ...created,
        // The full key is returned ONCE at creation time — never stored or returned again
        key: rawKey,
      },
      _warning: "Store this API key securely. It will not be shown again.",
    },
    201,
    { ...corsHeaders(), "X-Request-Id": ctx.requestId }
  );
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function GET(req: NextRequest) {
  return getHandler(req, { requestId: generateRequestId() });
}

export async function POST(req: NextRequest) {
  return postHandler(req, { requestId: generateRequestId() });
}
