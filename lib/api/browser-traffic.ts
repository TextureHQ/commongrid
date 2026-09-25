/**
 * Classify same-origin browser reads for a separate, bounded IP budget.
 * These headers are NOT authentication: scripts can forge all of them. The
 * browser tier must always retain hourly and burst limits and grant no access.
 */
export function isBrowserRead(req: Request): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/v1/") || url.pathname.includes("/bulk")) return false;
  if (req.headers.get("sec-fetch-site") !== "same-origin") return false;
  if (!["cors", "same-origin"].includes(req.headers.get("sec-fetch-mode") ?? "")) return false;
  if (req.headers.get("sec-fetch-dest") !== "empty") return false;

  // Compare exact origins, including scheme and port; never a suffix match.
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  try {
    if (origin && origin !== url.origin) return false;
    if (referer && new URL(referer).origin !== url.origin) return false;
    return Boolean(origin || referer);
  } catch {
    return false;
  }
}
