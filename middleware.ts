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
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/settings(.*)", "/mod/(.*)", "/developers/dashboard(.*)"]);

/**
 * Public API surface — these paths should be callable from any origin.
 *
 * CommonGrid is an open dataset; the `/api/v1/*` routes and every `/api/tiles/*`
 * route are intended for browsers, scripts, notebooks, and any third-party
 * consumer, so we return permissive CORS headers for them.
 *
 * Crucially, these routes should not pass through Clerk middleware at all.
 * Clerk attempts to authenticate arbitrary Bearer tokens and annotates responses
 * with x-clerk-auth-* failure headers (for example, `token-invalid`). That is
 * actively misleading on public API routes, where Bearer tokens belong to
 * CommonGrid's own API-key system rather than Clerk OAuth/session auth.
 *
 * We intentionally do NOT expose CORS on `/api/webhooks/*`, `/api/internal/*`
 * (none should exist long-term — see the OSS covenant), or any future auth-gated
 * non-v1 route.
 */
function isClerkProtectedApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/v1/contributions") ||
    pathname.startsWith("/api/v1/developer") ||
    pathname.startsWith("/api/v1/discussions") ||
    pathname.startsWith("/api/v1/follows") ||
    pathname.startsWith("/api/v1/me") ||
    pathname.startsWith("/api/v1/mod") ||
    pathname.startsWith("/api/v1/notifications")
  );
}

function isPublicApiPath(pathname: string): boolean {
  return (pathname.startsWith("/api/v1/") && !isClerkProtectedApiPath(pathname)) || pathname.startsWith("/api/tiles/");
}

/**
 * CORS preflight for the public API: short-circuit OPTIONS with 204 + headers.
 */
export function publicApiPreflightResponse(): NextResponse {
  const preflight = new NextResponse(null, { status: 204 });
  preflight.headers.set("Access-Control-Allow-Origin", "*");
  preflight.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  preflight.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
  preflight.headers.set("Access-Control-Max-Age", "86400");
  return preflight;
}

function appendVary(value: string | null, token: string): string {
  if (!value) return token;
  const parts = value.split(",").map((part) => part.trim().toLowerCase());
  return parts.includes(token.toLowerCase()) ? value : `${value}, ${token}`;
}

function applySecurityHeaders(response: NextResponse, pathname: string): void {
  if (!pathname.startsWith("/api/")) return;

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "0");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

function applyPublicApiCorsHeaders(response: NextResponse): void {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Expose-Headers", "ETag, Cache-Control, Content-Type, X-Total-Count");
  response.headers.set("Vary", appendVary(response.headers.get("Vary"), "Origin"));
}

export function publicApiResponse(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  if (!isPublicApiPath(pathname)) return null;

  if (request.method === "OPTIONS") {
    return publicApiPreflightResponse();
  }

  const response = NextResponse.next();
  applySecurityHeaders(response, pathname);
  applyPublicApiCorsHeaders(response);
  return response;
}

const clerkAuthMiddleware = clerkMiddleware(async (auth, request) => {
  // Protect authenticated routes
  if (isProtectedRoute(request)) {
    await auth.protect();
  }

  const response = NextResponse.next();
  applySecurityHeaders(response, request.nextUrl.pathname);

  return response;
});

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent
): ReturnType<typeof clerkAuthMiddleware> {
  const publicResponse = publicApiResponse(request);
  if (publicResponse) return publicResponse;

  return clerkAuthMiddleware(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
