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

  it("rejects unknown order values with VALIDATION_ERROR", () => {
    expect(() => parsePaginationParams(new URLSearchParams("order=random"))).toThrowError(/order must be one of/);
    try {
      parsePaginationParams(new URLSearchParams("order=random"));
    } catch (err) {
      expect(err).toMatchObject({
        code: "VALIDATION_ERROR",
        details: { field: "order", invalid: ["random"] },
      });
    }
  });

  it("parses sort field", () => {
    const params = parsePaginationParams(new URLSearchParams("sort=name"));
    expect(params.sort).toBe("name");
  });

  it("rejects unknown sort when allowedSorts is set", () => {
    expect(() =>
      parsePaginationParams(new URLSearchParams("sort=nope"), {
        allowedSorts: ["slug", "name"],
        defaultSort: "slug",
      })
    ).toThrowError(/sort must be one of/);
  });

  it("defaults sort to defaultSort when allowedSorts is set and sort is absent", () => {
    const params = parsePaginationParams(new URLSearchParams(), {
      allowedSorts: ["slug", "name", "customerCount"],
      defaultSort: "slug",
    });
    expect(params.sort).toBe("slug");
  });

  it("accepts an allowlisted sort field", () => {
    const params = parsePaginationParams(new URLSearchParams("sort=name&order=desc"), {
      allowedSorts: ["slug", "name"],
      defaultSort: "slug",
    });
    expect(params.sort).toBe("name");
    expect(params.order).toBe("desc");
  });

  it("decodes a valid cursor token", () => {
    const token = encodeCursor(sampleCursor);
    const params = parsePaginationParams(new URLSearchParams(`cursor=${token}`));
    expect(params.cursor).toEqual(sampleCursor);
  });

  it("handles page:N cursor format (JSON mode)", () => {
    const params = parsePaginationParams(new URLSearchParams("cursor=page:2"));
    expect(params.cursor).toBeNull();
    expect(params.limit).toBe(50);
  });

  it("handles page:10 cursor format", () => {
    const params = parsePaginationParams(new URLSearchParams("cursor=page:10&limit=25"));
    expect(params.cursor).toBeNull();
    expect(params.limit).toBe(25);
  });
});
