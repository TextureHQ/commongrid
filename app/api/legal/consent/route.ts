import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { legalConsents } from "@/lib/db/schema/legal-consents";
import { consentRequestSchema, consentSubjectHash } from "@/lib/legal/consent";
import { ACCEPTABLE_USE_PATH, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal/policies";

export async function POST(request: Request) {
  const json: unknown = await request.json().catch(() => null);
  const parsed = consentRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid policy assent" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const subjectHash = consentSubjectHash({
    userId: user?.id,
    anonymousReceiptId: parsed.data.anonymousReceiptId,
  });
  const db = getDb();
  const [inserted] = await db
    .insert(legalConsents)
    .values({
      userId: user?.id ?? null,
      subjectHash,
      termsVersion: parsed.data.termsVersion,
      acceptableUseVersion: parsed.data.acceptableUseVersion,
      termsPath: TERMS_PATH,
      acceptableUsePath: ACCEPTABLE_USE_PATH,
      privacyPath: PRIVACY_PATH,
    })
    .onConflictDoNothing({
      target: [legalConsents.subjectHash, legalConsents.termsVersion, legalConsents.acceptableUseVersion],
    })
    .returning();

  return NextResponse.json(
    {
      accepted: true,
      acceptedAt: inserted?.acceptedAt.toISOString() ?? null,
      policies: {
        terms: { version: parsed.data.termsVersion, path: TERMS_PATH },
        acceptableUse: { version: parsed.data.acceptableUseVersion, path: ACCEPTABLE_USE_PATH },
        privacy: { path: PRIVACY_PATH },
      },
    },
    { status: inserted ? 201 : 200 }
  );
}
