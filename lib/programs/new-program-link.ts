/**
 * Helpers for linking into the "add a program" contribution form with a utility
 * already chosen.
 *
 * Why this is a module and not an inline template string: the create-program
 * form and every entry point that links to it have to agree on the query
 * parameter name and on what counts as a usable slug. When they drifted, the
 * form silently opened with an empty Administrator Utility field and the
 * contributor had to re-find the utility they had just been looking at — a
 * failure with no error message, which is exactly the kind of thing worth
 * pinning down with tests.
 */

/** Query parameter carrying the utility slug to preselect. */
export const NEW_PROGRAM_UTILITY_PARAM = "utility";

/** Route of the create-program contribution form. */
export const NEW_PROGRAM_PATH = "/programs/new";

/**
 * Build a link to the create-program form, optionally preselecting a utility as
 * the program administrator.
 *
 * The slug is URI-encoded because it lands in a query string. Slugs are
 * generated lowercase-and-hyphenated so encoding is normally a no-op, but a
 * malformed or externally supplied value must not be able to inject additional
 * parameters.
 */
export function buildNewProgramHref(utilitySlug?: string | null): string {
  const slug = normalizeUtilitySlug(utilitySlug);
  if (!slug) return NEW_PROGRAM_PATH;
  return `${NEW_PROGRAM_PATH}?${NEW_PROGRAM_UTILITY_PARAM}=${encodeURIComponent(slug)}`;
}

/**
 * Read a preselected utility slug out of the create-program form's query string.
 *
 * Returns `""` — the value the picker uses for "nothing selected" — for anything
 * unusable, so the form degrades to an empty field rather than requesting a
 * utility that cannot exist.
 */
export function parseNewProgramUtilityParam(value: string | null | undefined): string {
  return normalizeUtilitySlug(value);
}

/**
 * Accept only characters that appear in a CommonGrid slug.
 *
 * Anything else is a caller mistake or a hand-edited URL; treating it as "no
 * selection" keeps a bad value out of both the API request and the form state.
 */
function normalizeUtilitySlug(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) return "";
  return trimmed;
}
