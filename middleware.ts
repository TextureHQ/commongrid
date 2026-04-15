/**
 * Next.js edge middleware — security headers for all API responses.
 *
 * Runs before every matched request and injects HTTP security headers
 * recommended by OWASP. Only applied to /api/* routes to keep non-API
 * pages unaffected.
 *
 * See docs/specs/persistence-api.md §12.3.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(_request: NextRequest): NextResponse {
  const response = NextResponse.next();

  // Prevent MIME-type sniffing.
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Disallow embedding in frames (clickjacking defence).
  response.headers.set("X-Frame-Options", "DENY");

  // Disable legacy XSS filter — modern browsers handle this via CSP.
  response.headers.set("X-XSS-Protection", "0");

  // Limit referrer information sent to third parties.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
