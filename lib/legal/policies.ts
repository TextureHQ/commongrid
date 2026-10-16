export const TERMS_VERSION = "2026-10-16";
export const ACCEPTABLE_USE_VERSION = "2026-10-16";
export const POLICY_EFFECTIVE_DATE = "October 16, 2026";

export const TERMS_PATH = "/terms";
export const ACCEPTABLE_USE_PATH = "/acceptable-use";
export const PRIVACY_PATH = "/privacy";

export const TERMS_STORAGE_KEY = `commongrid:policy-assent:${TERMS_VERSION}:${ACCEPTABLE_USE_VERSION}`;
export const ANONYMOUS_RECEIPT_STORAGE_KEY = "commongrid:anonymous-receipt-id";

export function requiresPolicyAssent(pathname: string): boolean {
  return [
    "/explore",
    "/utilities",
    "/programs",
    "/rates",
    "/grid-operators",
    "/balancing-authorities",
    "/power-plants",
    "/substations",
    "/transmission-lines",
    "/pricing-nodes",
    "/ev-charging",
    "/snapshots",
    "/developers",
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
