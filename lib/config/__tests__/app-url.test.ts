import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, getAppUrl } from "../app-url";

describe("getAppUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    vi.stubEnv("VERCEL_URL", "ignored.vercel.app");
    expect(getAppUrl()).toBe("https://example.com");
  });

  it("falls back to VERCEL_URL when NEXT_PUBLIC_APP_URL is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "cg-foo.vercel.app");
    expect(getAppUrl()).toBe("https://cg-foo.vercel.app");
  });

  it("uses the hardcoded fallback when both env vars are unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(getAppUrl()).toBe("https://commongrid.info");
  });

  it("strips trailing slashes from the env value", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com/");
    expect(getAppUrl()).toBe("https://example.com");
  });

  it("never returns a URL starting with 'undefined' or a relative URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "undefined");
    vi.stubEnv("VERCEL_URL", "undefined");
    const url = getAppUrl();
    expect(url.startsWith("undefined")).toBe(false);
    expect(url.startsWith("http://") || url.startsWith("https://")).toBe(true);
  });
});

describe("absoluteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("joins a path with a leading slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com/");
    expect(absoluteUrl("/contributions/123")).toBe("https://example.com/contributions/123");
  });

  it("adds a leading slash when missing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    expect(absoluteUrl("contributions/123")).toBe("https://example.com/contributions/123");
  });
});
