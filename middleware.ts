/**
 * Next.js middleware — Clerk auth + security headers.
 *
 * Clerk's `clerkMiddleware` handles session management automatically.
 * We layer security headers on top for all API responses.
 *
 * Protected routes (require sign-in):
 *   /settings, /mod/*, /developers/dashboard
 *
 * See docs/specs/persistence-api.md §12.3 for security headers.
 * See docs/specs/community-contributions-api-prd.md §3.2 for auth spec.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/settings(.*)", "/mod/(.*)", "/developers/dashboard(.*)"]);

/**
 * Public API surface — these paths should be callable from any origin.
 *
 * CommonGrid is an open dataset; the `/api/v1/*` routes and every `/api/tiles/*`
 * route are intended for browsers, scripts, notebooks, and any third-party
 * consumer, so we return permissive CORS headers for them.
 *
 * We intentionally do NOT expose CORS on `/api/webhooks/*`, `/api/internal/*`
 * (none should exist long-term — see the OSS covenant), or any future auth-gated
 * non-v1 route.
 */
function isPublicApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/v1/") || pathname.startsWith("/api/tiles/");
}

export default clerkMiddleware(async (auth, request) => {
  // Protect authenticated routes
  if (isProtectedRoute(request)) {
    await auth.protect();
  }

  const pathname = request.nextUrl.pathname;

  // CORS preflight for the public API: short-circuit OPTIONS with 204 + headers.
  if (request.method === "OPTIONS" && isPublicApiPath(pathname)) {
    const preflight = new NextResponse(null, { status: 204 });
    preflight.headers.set("Access-Control-Allow-Origin", "*");
    preflight.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    preflight.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
    preflight.headers.set("Access-Control-Max-Age", "86400");
    return preflight;
  }

  const response = NextResponse.next();

  // Security headers for API routes
  if (pathname.startsWith("/api/")) {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "0");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }

  // CORS for public API: allow any origin to consume the open dataset.
  // Tile routes already set these headers themselves, but re-setting here is
  // idempotent and ensures every /api/v1/* response is browser-reachable.
  if (isPublicApiPath(pathname)) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Expose-Headers", "ETag, Cache-Control, Content-Type, X-Total-Count");
    // Always vary on Origin so CDN caches don't cross-contaminate.
    const existingVary = response.headers.get("Vary");
    response.headers.set("Vary", existingVary ? `${existingVary}, Origin` : "Origin");
  }

  return response;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
