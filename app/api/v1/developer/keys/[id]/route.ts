/**
 * PATCH  /api/v1/developer/keys/:id — Update API key metadata
 * DELETE /api/v1/developer/keys/:id — Revoke an API key
 *
 * Both endpoints require Clerk auth and ownership verification.
 *
 * See LDR-63: Enhanced API keys — CRUD endpoints for developer API key management
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
import { apiKeys } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Helper: fetch key and verify ownership
// ---------------------------------------------------------------------------

async function getOwnedKey(keyId: string, userId: string) {
  const db = getDb();
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);

  if (!key) {
    throw new ApiError("NOT_FOUND", `API key ${keyId} not found.`);
  }

  if (key.userId !== userId) {
    throw new ApiError("FORBIDDEN", "You can only manage your own API keys.");
  }

  return key;
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/developer/keys/:id — Update key metadata
// ---------------------------------------------------------------------------

async function handlePatch(req: Request, ctx: RouteContext) {
  const keyId = ctx.params?.id;
  if (!keyId) {
    throw new ApiError("BAD_REQUEST", "Key ID is required.");
  }

  const user = await requireCurrentUser();
  const key = await getOwnedKey(keyId, user.id);

  if (!key.isActive) {
    throw new ApiError("BAD_REQUEST", "Cannot update a revoked key.");
  }

  const body = await req.json();
  const { name, app_name, scopes } = body;

  // At least one field must be provided
  if (name === undefined && app_name === undefined && scopes === undefined) {
    throw new ApiError("VALIDATION_ERROR", "At least one of name, app_name, or scopes must be provided.");
  }

  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new ApiError("VALIDATION_ERROR", "name must be a non-empty string.", { field: "name" });
    }
    updates.name = name.trim();
  }

  if (app_name !== undefined) {
    if (typeof app_name !== "string" || app_name.trim().length === 0) {
      throw new ApiError("VALIDATION_ERROR", "app_name must be a non-empty string.", { field: "app_name" });
    }
    updates.appName = app_name.trim();
  }

  if (scopes !== undefined) {
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new ApiError("VALIDATION_ERROR", "scopes must be a non-empty array.", { field: "scopes" });
    }
    updates.scopes = scopes;
  }

  const db = getDb();
  const [updated] = await db.update(apiKeys).set(updates).where(eq(apiKeys.id, keyId)).returning({
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
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
  });

  return jsonResponse({ data: updated }, 200, {
    ...corsHeaders(),
    "X-Request-Id": ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/developer/keys/:id — Revoke key (soft delete)
// ---------------------------------------------------------------------------

async function handleDelete(_req: Request, ctx: RouteContext) {
  const keyId = ctx.params?.id;
  if (!keyId) {
    throw new ApiError("BAD_REQUEST", "Key ID is required.");
  }

  const user = await requireCurrentUser();
  const key = await getOwnedKey(keyId, user.id);

  if (!key.isActive) {
    throw new ApiError("BAD_REQUEST", "Key is already revoked.");
  }

  const db = getDb();
  await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.id, keyId));

  return jsonResponse({ data: { id: keyId, revoked: true } }, 200, { ...corsHeaders(), "X-Request-Id": ctx.requestId });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const patchHandler = withRequestId(withErrorHandling(withTiming(handlePatch)));
const deleteHandler = withRequestId(withErrorHandling(withTiming(handleDelete)));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return patchHandler(req, { requestId: generateRequestId(), params: { id } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteHandler(req, { requestId: generateRequestId(), params: { id } });
}
