/**
 * Canonical application URL resolution.
 *
 * Production was emitting links like `undefined/contributions/<id>` because
 * `process.env.NEXT_PUBLIC_APP_URL` is not set in Vercel. This helper provides
 * a guaranteed-absolute fallback chain so notification and email URLs are never
 * relative and never contain the literal string "undefined".
 */

/**
 * Returns the canonical absolute base URL for the CommonGrid deployment.
 *
 * Precedence:
 * 1. `process.env.NEXT_PUBLIC_APP_URL` (trimmed, trailing slashes stripped,
 *    must start with `http://` or `https://`).
 * 2. `https://${process.env.VERCEL_URL}` when VERCEL_URL is set and sane.
 * 3. Hardcoded fallback `https://commongrid.info`.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw && (raw.startsWith("http://") || raw.startsWith("https://"))) {
    return raw.replace(/\/+$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl && !vercelUrl.includes("undefined") && !vercelUrl.startsWith("http")) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }

  return "https://commongrid.info";
}

/**
 * Joins the canonical base URL with a path, normalizing leading slashes.
 */
export function absoluteUrl(path: string): string {
  const base = getAppUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}
