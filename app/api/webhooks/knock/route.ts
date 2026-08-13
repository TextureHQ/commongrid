/**
 * Knock Delivery Status Webhook
 *
 * POST /api/webhooks/knock
 *
 * Receives webhook events from Knock when emails are delivered, bounced, read,
 * or fail. Updates the notifications table and writes to knock_delivery_log.
 *
 * Security:
 * - Validates x-knock-signature header (HMAC-SHA256, timing-safe)
 * - Idempotent (safe to receive the same event multiple times)
 */

import { type NextRequest, NextResponse } from "next/server";
import type { KnockWebhookPayload } from "@/lib/knock";
import { processKnockWebhookEvent, verifyKnockWebhook } from "@/lib/knock";
import { flushTelemetry, reportError } from "@/lib/observability";

export async function POST(req: NextRequest) {
  // 1. Read raw body for signature verification
  const rawBody = await req.text();

  // 2. Validate signature
  const signature = req.headers.get("x-knock-signature") ?? "";
  if (!verifyKnockWebhook(rawBody, signature)) {
    console.warn("[knock webhook] Invalid signature");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 3. Parse payload
  let payload: KnockWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as KnockWebhookPayload;
  } catch (err) {
    // Malformed body from an already signature-verified sender means Knock
    // changed its payload shape (or we verified the wrong bytes) — that is a
    // real integration defect, not client noise.
    reportError(err, { scope: "webhook.knock", extra: { phase: "parse-payload" } });
    await flushTelemetry();
    return new NextResponse("Bad Request", { status: 400 });
  }

  console.info(`[knock webhook] Received ${payload.type} for message ${payload.data.id}`);

  // 4. Process the event (update DB, write to delivery log)
  try {
    await processKnockWebhookEvent(payload);
  } catch (err) {
    // Return 200 anyway — Knock retries on 5xx, and we already logged
    // the delivery event, so this prevents infinite retry loops. The error is
    // still reported so the swallowed failure is visible.
    reportError(err, {
      scope: "webhook.knock",
      extra: { phase: "process-event", eventType: payload.type, messageId: payload.data.id },
    });
    await flushTelemetry();
  }

  return new NextResponse("OK", { status: 200 });
}
