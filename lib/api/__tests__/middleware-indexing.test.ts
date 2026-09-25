import { type NextFetchEvent, NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import middleware from "@/middleware";

// Exercise the real no-auth middleware path, not just the policy predicate.
// The configured Clerk path uses the same response-header function.
describe("crawler indexing headers", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/sign-in", "/sign-up/sso-callback", "/mod/users", "/developers", "/settings", "/power-plants/new"])(
    "sends noindex on %s",
    async (path) => {
      const response = await middleware(new NextRequest(`https://commongrid.info${path}`), {} as NextFetchEvent);
      expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  );

  it.each(["/", "/about", "/explore/utilities", "/social-image", "/sitemap.xml", "/robots.txt"])(
    "does not noindex public surface %s",
    async (path) => {
      const response = await middleware(new NextRequest(`https://commongrid.info${path}`), {} as NextFetchEvent);
      expect(response?.headers.get("X-Robots-Tag")).toBeNull();
    }
  );
});
