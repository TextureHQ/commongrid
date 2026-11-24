/**
 * Who can confirm a utility's record: someone whose verified sign-in email is
 * at one of the utility's domains.
 *
 * Pure functions, no DB or Clerk calls. The route passes in Clerk's current
 * user; only the primary email, and only once Clerk has verified it, counts.
 * `users.email` isn't used: it can be filled from an address that isn't the
 * verified primary one.
 *
 * Domains come from `utilities.domains` plus the host of `utilities.website`.
 * A malformed website (e.g. "www.snopud-com") simply never matches.
 */

/** Personal email providers never count, even if a utility lists one. */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "comcast.net",
  "att.net",
  "verizon.net",
  "sbcglobal.net",
]);

/** Website hosts that many unrelated organizations share, so their staff can't stand for a utility. */
const SHARED_HOSTS = new Set([
  "facebook.com",
  "google.com",
  "sites.google.com",
  "wixsite.com",
  "squarespace.com",
  "wordpress.com",
  "weebly.com",
  "godaddysites.com",
  "blogspot.com",
  "linkedin.com",
]);

/** Lowercase, drop "www." and a trailing dot, accept URLs. Null if it isn't a usable domain. */
export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  let d = value.trim().toLowerCase();
  if (!d) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(d);
  if (hasScheme || d.includes("/")) {
    try {
      d = new URL(hasScheme ? d : `https://${d}`).hostname;
    } catch {
      return null;
    }
  }
  d = d.replace(/^www\./, "").replace(/\.$/, "");
  const labels = d.split(".");
  const tld = labels[labels.length - 1] ?? "";
  if (labels.length < 2 || !/^[a-z]{2,}$/.test(tld) || labels.some((l) => l === "")) return null;
  return d;
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  return normalizeDomain(email.slice(at + 1));
}

/** Every domain on record for a utility that could identify its staff. */
export function utilityDomains(utility: { website: string | null; domains: string[] | null }): string[] {
  const all = [...(utility.domains ?? []), utility.website].map(normalizeDomain).filter((d): d is string => !!d);
  return [...new Set(all)].filter((d) => !PERSONAL_EMAIL_DOMAINS.has(d) && !SHARED_HOSTS.has(d));
}

/**
 * The utility domain the email belongs to, or null. The email may be at the
 * domain itself or a subdomain of it ("mail.4county.org" matches
 * "4county.org"), never a parent ("coop.org" doesn't match "example.coop.org").
 */
export function matchingDomain(
  email: string | null | undefined,
  utility: { website: string | null; domains: string[] | null }
): string | null {
  const ed = emailDomain(email);
  if (!ed || PERSONAL_EMAIL_DOMAINS.has(ed)) return null;
  return utilityDomains(utility).find((d) => ed === d || ed.endsWith(`.${d}`)) ?? null;
}

/** The parts of Clerk's server-side User this needs. */
export interface ClerkEmailSource {
  primaryEmailAddress: { emailAddress: string; verification: { status: string } | null } | null;
}

/** The primary email, only if Clerk has verified it. */
export function verifiedPrimaryEmail(user: ClerkEmailSource | null | undefined): string | null {
  const primary = user?.primaryEmailAddress;
  if (primary?.verification?.status !== "verified") return null;
  return primary.emailAddress;
}
