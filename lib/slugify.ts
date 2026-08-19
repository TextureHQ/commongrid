// Acronyms and state codes that should stay upper-cased when a slug is
// humanized back into display text.
const SLUG_UPPERCASE_TOKENS = new Set([
  "llc",
  "inc",
  "pud",
  "emc",
  "rec",
  "iou",
  "cca",
  "iso",
  "rto",
  "usa",
  "us",
  "tva",
  "bpa",
  "nyc",
  "dc",
]);

/**
 * Turn a slug back into human-readable display text.
 *
 * A best-effort fallback only — used when an entity slug referenced by another
 * record can't be resolved to a real row, so the UI can show
 * "Central Georgia El Member" instead of rendering nothing at all. Prefer the
 * entity's actual `name` field whenever it is available.
 *
 * Example: "central-georgia-el-member" → "Central Georgia El Member"
 */
export function humanizeSlug(slug: string): string {
  const cleaned = slug.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned === "") return slug;

  return cleaned
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (SLUG_UPPERCASE_TOKENS.has(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Convert a string to a URL-safe slug
 *
 * Example: "Pacific Gas & Electric" → "pacific-gas-electric"
 */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, "-")
      // Remove all non-alphanumeric characters except hyphens
      .replace(/[^a-z0-9-]+/g, "")
      // Replace multiple consecutive hyphens with a single hyphen
      .replace(/-+/g, "-")
      // Remove leading and trailing hyphens
      .replace(/^-+|-+$/g, "")
  );
}
