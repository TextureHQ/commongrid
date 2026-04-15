import { beforeEach, describe, expect, it } from "vitest";

import type { CursorV1 } from "../pagination";
import { decodeCursor, encodeCursor, parsePaginationParams } from "../pagination";

beforeEach(() => {
  process.env.CURSOR_SECRET = "test-secret-for-unit-tests";
});

const sampleCursor: CursorV1 = {
  v: 1,
  s: { name: "Acme Utility", createdAt: "2024-01-01" },
  id: "util_abc123",
};

describe("encodeCursor / decodeCursor round-trip", () => {
  it("decodes what it encodes", () => {
    const token = encodeCursor(sampleCursor);
    const decoded = decodeCursor(token);
    expect(decoded).toEqual(sampleCursor);
  });

  it("produces a dot-separated token", () => {
    const token = encodeCursor(sampleCursor);
    expect(token).toContain(".");
  });

  it("produces URL-safe characters only", () => {
    const token = encodeCursor(sampleCursor);
    expect(token).toMatch(/^[A-Za-z0-9_\-=.]+$/);
  });
});

describe("decodeCursor tamper detection", () => {
  it("throws BAD_REQUEST on modified payload", () => {
    const token = encodeCursor(sampleCursor);
    const [payload, sig] = token.split(".");
    // Flip one character in the payload
    const tampered = `${payload.slice(0, -1)}X.${sig}`;
    expect(() => decodeCursor(tampered)).toThrowError(/cursor/i);
  });

  it("throws BAD_REQUEST on modified signature", () => {
    const token = encodeCursor(sampleCursor);
    const dotIdx = token.lastIndexOf(".");
    const tamperedSig = token.slice(dotIdx + 1).replace(/.$/, "X");
    const tampered = `${token.slice(0, dotIdx + 1)}${tamperedSig}`;
    expect(() => decodeCursor(tampered)).toThrowError(/cursor/i);
  });

  it("throws BAD_REQUEST on missing dot separator", () => {
    expect(() => decodeCursor("nodothere")).toThrowError(/cursor/i);
  });

  it("throws BAD_REQUEST on non-base64 payload", () => {
    const badPayload = "!!!.abcdef1234567890";
    expect(() => decodeCursor(badPayload)).toThrowError(/cursor/i);
  });
});

describe("encodeCursor throws when CURSOR_SECRET is missing", () => {
  it("throws INTERNAL_ERROR if env var is absent", () => {
    const saved = process.env.CURSOR_SECRET;
    delete process.env.CURSOR_SECRET;
    try {
      expect(() => encodeCursor(sampleCursor)).toThrowError(/CURSOR_SECRET/i);
    } finally {
      process.env.CURSOR_SECRET = saved;
    }
  });
});

describe("parsePaginationParams", () => {
  it("returns defaults for empty params", () => {
    const params = parsePaginationParams(new URLSearchParams());
    expect(params.cursor).toBeNull();
    expect(params.limit).toBe(50);
    expect(params.order).toBe("asc");
    expect(params.sort).toBeUndefined();
  });

  it("parses limit within bounds", () => {
    expect(parsePaginationParams(new URLSearchParams("limit=100")).limit).toBe(100);
    // limit=0 → parseInt("0") is falsy, falls back to default 50
    expect(parsePaginationParams(new URLSearchParams("limit=0")).limit).toBe(50);
    expect(parsePaginationParams(new URLSearchParams("limit=999")).limit).toBe(200);
  });

  it("parses order desc", () => {
    const params = parsePaginationParams(new URLSearchParams("order=desc"));
    expect(params.order).toBe("desc");
  });

  it("defaults to asc for unknown order values", () => {
    const params = parsePaginationParams(new URLSearchParams("order=random"));
    expect(params.order).toBe("asc");
  });

  it("parses sort field", () => {
    const params = parsePaginationParams(new URLSearchParams("sort=name"));
    expect(params.sort).toBe("name");
  });

  it("decodes a valid cursor token", () => {
    const token = encodeCursor(sampleCursor);
    const params = parsePaginationParams(new URLSearchParams(`cursor=${token}`));
    expect(params.cursor).toEqual(sampleCursor);
  });
});
