/**
 * GET  /api/v1/confirmations/{slug} — what someone at this utility can confirm
 * POST /api/v1/confirmations/{slug} — confirm fields are still right
 *
 * Both need sign-in. Confirming also needs a verified primary email at one of
 * the utility's domains; anyone else can still suggest edits as usual. A
 * confirmation never changes the record and creates no moderator work.
 *
 * POST body: { fields: [{ entityType, entityId, fieldName, value }] }, where
 * `value` is what the person saw. Changed values are refused (409) so nobody
 * confirms something they didn't see. See lib/confirmations/record.ts.
 */

import { currentUser } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { corsHeaders } from "@/lib/api/cors";
import { ApiError } from "@/lib/api/errors";
import { generateRequestId, withErrorHandling, withRequestId, withTiming } from "@/lib/api/middleware";
import { jsonResponse } from "@/lib/api/response";
import type { RouteContext } from "@/lib/api/types";
import { requireCurrentUser } from "@/lib/auth";
import { emailDomain, matchingDomain, verifiedPrimaryEmail } from "@/lib/confirmations/email-match";
import { parseConfirmRequest } from "@/lib/confirmations/record";
import { type LoadedRecord, loadRecord, saveConfirmations } from "@/lib/confirmations/store";

async function viewerFor(record: LoadedRecord) {
  const email = verifiedPrimaryEmail(await currentUser());
  const matched = matchingDomain(email, record.utility);
  return {
    /** Domain of the verified primary email, if any. Shown back to the person only. */
    emailDomain: emailDomain(email),
    canConfirm: matched !== null,
    matchedDomain: matched,
  };
}

async function load(ctx: RouteContext): Promise<LoadedRecord> {
  const slug = ctx.params?.slug;
  if (!slug) throw new ApiError("BAD_REQUEST", "Missing slug.");
  const record = await loadRecord(slug);
  if (!record) throw new ApiError("NOT_FOUND", `No utility with slug "${slug}".`);
  return record;
}

const headers = (ctx: RouteContext) => ({
  ...corsHeaders(),
  "X-Request-Id": ctx.requestId,
  "Cache-Control": "private, no-store",
});

async function handleGet(_req: Request, ctx: RouteContext) {
  await requireCurrentUser();
  const record = await load(ctx);
  const { domains: _domains, ...utility } = record.utility;
  return jsonResponse({ data: { utility, rows: record.rows, viewer: await viewerFor(record) } }, 200, headers(ctx));
}

async function handlePost(req: Request, ctx: RouteContext) {
  const user = await requireCurrentUser();
  if (user.bannedAt && (!user.bannedUntil || user.bannedUntil > new Date())) {
    throw new ApiError("FORBIDDEN", "Your account is currently suspended.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Body must be valid JSON.");
  }
  const parsed = parseConfirmRequest(body);
  if (!parsed.ok) throw new ApiError("VALIDATION_ERROR", parsed.error);

  const record = await load(ctx);
  const viewer = await viewerFor(record);
  if (!viewer.matchedDomain) {
    throw new ApiError("FORBIDDEN", `Only someone signed in with a verified ${record.utility.name} email can confirm.`);
  }

  const outcome = await saveConfirmations(record, parsed.fields, {
    userId: user.id,
    emailDomain: viewer.matchedDomain,
  });
  if (outcome.kind === "rejected") {
    if (outcome.unknown.length > 0) {
      throw new ApiError("VALIDATION_ERROR", "Some fields can't be confirmed for this utility.", {
        fields: outcome.unknown,
      });
    }
    throw new ApiError("CONFLICT", "Some of this record changed since you opened it. Reload and check again.", {
      fields: outcome.stale,
    });
  }

  return jsonResponse(
    { data: { saved: outcome.saved, confirmedAt: outcome.confirmedAt, confirmedBy: record.utility.confirmerName } },
    201,
    headers(ctx)
  );
}

const getHandler = withRequestId(withErrorHandling(withTiming(handleGet)));
const postHandler = withRequestId(withErrorHandling(withTiming(handlePost)));

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return getHandler(req, { requestId: generateRequestId(), params: { slug } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return postHandler(req, { requestId: generateRequestId(), params: { slug } });
}
