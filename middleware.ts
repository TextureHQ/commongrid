/**
 * Next.js middleware — Clerk auth + security headers.
 *
 * Clerk's `clerkMiddleware` handles session management automatically.
 * We layer security headers on top for all API responses.
 *
 * Protected routes (require sign-in):
 *   /contributions, /settings, /mod/*, /developers/dashboard
 *
 * See docs/specs/persistence-api.md §12.3 for security headers.
 * See docs/specs/community-contributions-api-prd.md §3.2 for auth spec.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/contributions(.*)",
  "/settings(.*)",
  "/mod/(.*)",
  "/developers/dashboard(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // Protect authenticated routes
  if (isProtectedRoute(request)) {
    await auth.protect();
  }

  const response = NextResponse.next();

  // Security headers for API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "0");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
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
