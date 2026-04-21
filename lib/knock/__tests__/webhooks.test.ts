import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyKnockWebhook } from "../webhooks";

// verifyKnockWebhook is a pure crypto function — no external mocking needed.

const SIGNING_KEY = "super-secret-signing-key";
const BODY = JSON.stringify({ type: "message.delivered", data: { id: "msg-1" } });

function makeSignature(body: string, key: string): string {
  const hex = createHmac("sha256", key).update(Buffer.from(body, "utf8")).digest("hex");
  return `sha256=${hex}`;
}

describe("verifyKnockWebhook", () => {
  it("returns true for a valid signature (string body)", () => {
    const sig = makeSignature(BODY, SIGNING_KEY);
    expect(verifyKnockWebhook(BODY, sig, SIGNING_KEY)).toBe(true);
  });

  it("returns true for a valid signature (Buffer body)", () => {
    const buf = Buffer.from(BODY, "utf8");
    const sig = makeSignature(BODY, SIGNING_KEY);
    expect(verifyKnockWebhook(buf, sig, SIGNING_KEY)).toBe(true);
  });

  it("accepts a signature without the sha256= prefix", () => {
    const hex = createHmac("sha256", SIGNING_KEY).update(Buffer.from(BODY, "utf8")).digest("hex");
    expect(verifyKnockWebhook(BODY, hex, SIGNING_KEY)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(verifyKnockWebhook(BODY, "sha256=deadbeef", SIGNING_KEY)).toBe(false);
  });

  it("returns false when the body has been tampered with", () => {
    const sig = makeSignature(BODY, SIGNING_KEY);
    expect(verifyKnockWebhook(`${BODY}tampered`, sig, SIGNING_KEY)).toBe(false);
  });

  it("returns false when the signing key is missing and env var is not set", () => {
    const originalKey = process.env.KNOCK_SIGNING_KEY;
    delete process.env.KNOCK_SIGNING_KEY;

    const sig = makeSignature(BODY, SIGNING_KEY);
    const result = verifyKnockWebhook(BODY, sig);

    if (originalKey !== undefined) {
      process.env.KNOCK_SIGNING_KEY = originalKey;
    }

    expect(result).toBe(false);
  });

  it("returns false when signature is an empty string", () => {
    expect(verifyKnockWebhook(BODY, "", SIGNING_KEY)).toBe(false);
  });

  it("falls back to KNOCK_SIGNING_KEY env var when no key argument is passed", () => {
    const originalKey = process.env.KNOCK_SIGNING_KEY;
    process.env.KNOCK_SIGNING_KEY = SIGNING_KEY;

    const sig = makeSignature(BODY, SIGNING_KEY);
    const result = verifyKnockWebhook(BODY, sig);

    if (originalKey !== undefined) {
      process.env.KNOCK_SIGNING_KEY = originalKey;
    } else {
      delete process.env.KNOCK_SIGNING_KEY;
    }

    expect(result).toBe(true);
  });
});
