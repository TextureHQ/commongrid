/**
 * Convert a string to a URL-safe slug
 *
 * Example: "Pacific Gas & Electric" → "pacific-gas-electric"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, "-")
    // Remove all non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]+/g, "")
    // Replace multiple consecutive hyphens with a single hyphen
    .replace(/-+/g, "-")
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, "");
}
