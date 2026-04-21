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

import { NextResponse, type NextRequest } from "next/server";
import { verifyKnockWebhook, processKnockWebhookEvent } from "@/lib/knock";
import type { KnockWebhookPayload } from "@/lib/knock";

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
    console.error("[knock webhook] Failed to parse payload:", err);
    return new NextResponse("Bad Request", { status: 400 });
  }

  console.info(`[knock webhook] Received ${payload.type} for message ${payload.data.id}`);

  // 4. Process the event (update DB, write to delivery log)
  try {
    await processKnockWebhookEvent(payload);
  } catch (err) {
    console.error("[knock webhook] Processing error:", err);
    // Return 200 anyway — Knock retries on 5xx, and we already logged
    // the delivery event, so this prevents infinite retry loops.
  }

  return new NextResponse("OK", { status: 200 });
}
