import { createHash } from "node:crypto";
import { z } from "zod";
import { ACCEPTABLE_USE_VERSION, TERMS_VERSION } from "./policies";

export const consentRequestSchema = z.object({
  anonymousReceiptId: z.string().uuid(),
  termsVersion: z.literal(TERMS_VERSION),
  acceptableUseVersion: z.literal(ACCEPTABLE_USE_VERSION),
});

export type ConsentRequest = z.infer<typeof consentRequestSchema>;

export function consentSubjectHash(input: { userId?: string | null; anonymousReceiptId: string }): string {
  const subject = input.userId ? `user:${input.userId}` : `anonymous:${input.anonymousReceiptId}`;
  return createHash("sha256").update(subject).digest("hex");
}
