/**
 * Clerk Webhook Handler
 *
 * Syncs Clerk user events to our local users + user_notification_prefs tables.
 *
 * Events handled:
 *   - user.created  → Insert users row + user_notification_prefs with defaults
 *   - user.updated  → Update display_name, email, avatar_url
 *   - user.deleted  → Soft-delete: set banned_at, preserve history
 *
 * Webhook signature verification via Svix (Clerk's webhook delivery service).
 *
 * ERD Reference: §9 Clerk Integration
 */

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getDb } from "@/lib/db/client";
import { userNotificationPrefs } from "@/lib/db/schema/user-notification-prefs";
import { users } from "@/lib/db/schema/users";

type ClerkEmailAddress = {
  email_address: string;
  id: string;
};

type ClerkUserEventData = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: ClerkEmailAddress[];
  primary_email_address_id: string | null;
  image_url: string | null;
  username: string | null;
};

type ClerkWebhookEvent = {
  type: string;
  data: ClerkUserEventData;
};

function getDisplayName(data: ClerkUserEventData): string {
  const parts = [data.first_name, data.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  if (data.username) return data.username;
  return "Anonymous";
}

function getPrimaryEmail(data: ClerkUserEventData): string | null {
  if (!data.primary_email_address_id || !data.email_addresses) return null;
  const primary = data.email_addresses.find((e) => e.id === data.primary_email_address_id);
  return primary?.email_address ?? data.email_addresses[0]?.email_address ?? null;
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  // Verify webhook signature
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.text();

  const wh = new Webhook(WEBHOOK_SECRET);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const db = getDb();

  try {
    switch (event.type) {
      case "user.created": {
        const data = event.data;
        const displayName = getDisplayName(data);
        const email = getPrimaryEmail(data);

        // Insert user + notification prefs atomically
        // Drizzle with neon-http doesn't support multi-statement transactions,
        // so we do sequential inserts. The notification prefs row references the
        // user row, so order matters.
        const [newUser] = await db
          .insert(users)
          .values({
            clerkUserId: data.id,
            displayName,
            email,
            avatarUrl: data.image_url,
          })
          .returning({ id: users.id });

        if (newUser) {
          await db.insert(userNotificationPrefs).values({
            userId: newUser.id,
          });
        }

        console.log(`User created: ${data.id} → ${newUser?.id}`);
        break;
      }

      case "user.updated": {
        const data = event.data;
        const displayName = getDisplayName(data);
        const email = getPrimaryEmail(data);

        await db
          .update(users)
          .set({
            displayName,
            email,
            avatarUrl: data.image_url,
            updatedAt: new Date(),
          })
          .where(eq(users.clerkUserId, data.id));

        console.log(`User updated: ${data.id}`);
        break;
      }

      case "user.deleted": {
        const data = event.data;

        // Soft-delete: set banned_at, preserve contribution history
        await db
          .update(users)
          .set({
            bannedAt: new Date(),
            banReason: "account_deleted",
            updatedAt: new Date(),
          })
          .where(eq(users.clerkUserId, data.id));

        console.log(`User soft-deleted: ${data.id}`);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
