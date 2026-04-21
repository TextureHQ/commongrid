/**
 * Knock Webhook Handling
 *
 * Verifies incoming Knock webhook signatures and processes delivery events.
 * Updates notification email_status and logs events to knock_delivery_log.
 *
 * All DB errors are logged and swallowed so the webhook returns 200 even
 * when our DB is temporarily unavailable (Knock will retry on 5xx).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { knockDeliveryLog, notifications } from "@/lib/db/schema";
import type { KnockWebhookEventType, KnockWebhookPayload } from "./types";

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a Knock webhook HMAC-SHA256 signature.
 *
 * Knock sends the signature as the `x-knock-signature` header in the format
 * `sha256=<hex-digest>`.  We compute our own digest over the raw body bytes
 * and compare using a timing-safe equality check.
 *
 * @param rawBody    - The raw request body buffer.
 * @param signature  - The value of the x-knock-signature header.
 * @param signingKey - The webhook signing key (defaults to KNOCK_SIGNING_KEY env var).
 * @returns true when the signature is valid.
 */
export function verifyKnockWebhook(
  rawBody: Buffer | string,
  signature: string,
  signingKey?: string
): boolean {
  const key = signingKey ?? process.env.KNOCK_SIGNING_KEY;
  if (!key) return false;
  if (!signature) return false;

  // Strip the "sha256=" prefix if present
  const incoming = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  const expected = createHmac("sha256", key)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(incoming, "hex"), Buffer.from(expected, "hex"));
  } catch {
    // buffers of different length — definitely invalid
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event processing
// ---------------------------------------------------------------------------

const EVENT_TO_EMAIL_STATUS: Partial<Record<KnockWebhookEventType, string>> = {
  "message.delivered": "sent",
  "message.bounced": "bounced",
  "message.undelivered": "failed",
};

/**
 * Process a verified Knock webhook payload.
 *
 * - Maps Knock delivery events to notification email_status.
 * - Sets readAt on message.read.
 * - Writes a row to knock_delivery_log for audit purposes.
 */
export async function processKnockWebhookEvent(payload: KnockWebhookPayload): Promise<void> {
  const db = getDb();
  const knockMessageId = payload.data.id;
  const eventType = payload.type;

  // Write to delivery log regardless of notification lookup result
  try {
    // Try to find the linked notification
    let notificationId: string | null = null;
    const [linked] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.knockMessageId, knockMessageId))
      .limit(1);
    if (linked) notificationId = linked.id;

    await db.insert(knockDeliveryLog).values({
      knockMessageId,
      notificationId,
      eventType,
      channel: payload.data.channel_id,
      status: EVENT_TO_EMAIL_STATUS[eventType] ?? eventType,
      metadata: payload.data as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.error("[knock/webhook] Failed to write delivery log:", err);
  }

  // Update notification status
  try {
    if (EVENT_TO_EMAIL_STATUS[eventType]) {
      const emailStatus = EVENT_TO_EMAIL_STATUS[eventType] as string;
      await db
        .update(notifications)
        .set({ emailStatus })
        .where(eq(notifications.knockMessageId, knockMessageId));
    }

    if (eventType === "message.read" && payload.data.read_at) {
      await db
        .update(notifications)
        .set({ readAt: new Date(payload.data.read_at) })
        .where(eq(notifications.knockMessageId, knockMessageId));
    }
  } catch (err) {
    console.error("[knock/webhook] Failed to update notification status:", err);
  }
}
