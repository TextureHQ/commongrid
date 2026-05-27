/**
 * Resolve CSS custom property (variable) to its computed color value.
 *
 * Mapbox/MapLibre GL JS cannot parse CSS variables like `var(--color-primary)`.
 * This utility resolves them to actual hex/rgb values by querying the browser's
 * computed styles.
 *
 * @param cssValue - A color value, which may be a CSS variable like `var(--color-primary)` or a direct color like `#ff0000`
 * @returns The resolved color value, or the original value if it's not a CSS variable
 */
export function resolveCSSColor(cssValue: string): string {
  // If it's not a CSS variable, return as-is
  if (!cssValue.startsWith("var(")) {
    return cssValue;
  }

  // Create a temporary element to compute the style
  const el = document.createElement("div");
  el.style.display = "none";
  el.style.color = cssValue;
  document.body.appendChild(el);

  const computed = window.getComputedStyle(el).color;
  document.body.removeChild(el);

  return computed;
}

/**
 * Resolve all CSS variables in a color mapping object.
 *
 * Takes a mapping like `{ key: { hex: "var(--color)" } }` and returns
 * `{ key: { hex: "#ff0000" } }` with all CSS variables resolved.
 */
export function resolveColorMapping<T extends string>(mapping: Record<T, { hex: string }>): Record<T, { hex: string }> {
  const resolved: Record<string, { hex: string }> = {};

  for (const [key, value] of Object.entries(mapping) as [string, { hex: string }][]) {
    resolved[key] = { hex: resolveCSSColor(value.hex) };
  }

  return resolved as Record<T, { hex: string }>;
}
