/**
 * Guard test: cross-entity detail links must use the identifier their route
 * actually resolves.
 *
 * Context: on 2026-08-13 the pricing node page linked to
 * `/power-plants/${node.eiaPlantCode}` — an EIA plant code, while the route is
 * keyed on slug — so every "Linked Power Plant" card 404'd. The same audit
 * found grid operator pages linking to `/programs/${slug}`, a route that has
 * never existed (programs live inside Explore).
 *
 * Both were silent: a bad href only surfaces when a human clicks it. This test
 * makes the whole class of bug fail in CI instead, by statically scanning
 * every templated internal href in the app and checking the interpolated
 * expression against the identifier the target route resolves.
 *
 * It is deliberately a lint-shaped test rather than a crawler: it needs no DB,
 * no server, and it catches the mistake at the moment it's written.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components"];

/**
 * How each entity detail route is addressed.
 *
 * `slug`  — `/<segment>/[slug]`, resolved against the entity's `slug` column.
 * `id`    — `/<segment>/[id]`, resolved against a raw upstream identifier
 *           (transmission lines are keyed on the HIFLD line ID; contributions
 *           on their UUID).
 * `none`  — no detail route exists at this path; linking there is always a
 *           404. Programs are viewed at `/explore?tab=programs&slug=…`.
 */
const ROUTE_IDENTIFIERS: Record<string, "slug" | "id" | "none"> = {
  "power-plants": "slug",
  "pricing-nodes": "slug",
  "grid-operators": "slug",
  "balancing-authorities": "slug",
  substations: "slug",
  "ev-charging": "slug",
  utilities: "slug",
  "transmission-lines": "id",
  programs: "none",
};

interface LinkRef {
  file: string;
  segment: string;
  expression: string;
  raw: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Match templated internal links of the form:
 *   href={`/power-plants/${plant.slug}`}
 *   href: `/pricing-nodes/${n.slug}`
 *   router.push(`/substations/${slug}`)
 *
 * Only the first path segment plus a single interpolation is considered — that
 * is exactly the "detail page link" shape we care about. Query-string links
 * (`/explore?tab=…`) are intentionally excluded: they're routed by param, not
 * by path identifier.
 */
function collectLinks(): LinkRef[] {
  const pattern = /`\/([a-z-]+)\/\$\{([^}]+)\}`/g;
  const refs: LinkRef[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(REPO_ROOT, dir))) {
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(pattern)) {
        refs.push({
          file: file.slice(REPO_ROOT.length + 1),
          segment: match[1],
          expression: match[2].trim(),
          raw: match[0],
        });
      }
    }
  }

  return refs;
}

/**
 * True when the interpolated expression plainly reads a slug.
 *
 * Accepts a bare `slug`, any `….slug` property read, and `*Slug` locals such
 * as `entitySlug` (the create-form response field) or `canonicalSlug`.
 */
function looksLikeSlug(expression: string): boolean {
  return /(^|\.|\?\.)([A-Za-z]*[Ss]lug)$/.test(expression);
}

/** True when the interpolated expression plainly reads an id. */
function looksLikeId(expression: string): boolean {
  return /(^|\.|\?\.)id$/.test(expression);
}

describe("cross-entity detail links", () => {
  const links = collectLinks();

  it("finds links to audit (guards against the scanner silently matching nothing)", () => {
    expect(links.length).toBeGreaterThan(10);
  });

  it("addresses slug-keyed routes with a slug", () => {
    const offenders = links
      .filter((l) => ROUTE_IDENTIFIERS[l.segment] === "slug")
      .filter((l) => !looksLikeSlug(l.expression))
      .map((l) => `${l.file}: ${l.raw}`);

    // e.g. `/power-plants/${node.eiaPlantCode}` — an EIA plant code is not a
    // slug, so the page 404s. Resolve it to the plant's slug first.
    expect(offenders).toEqual([]);
  });

  it("addresses id-keyed routes with an id", () => {
    const offenders = links
      .filter((l) => ROUTE_IDENTIFIERS[l.segment] === "id")
      .filter((l) => !looksLikeId(l.expression) && !looksLikeSlug(l.expression))
      .map((l) => `${l.file}: ${l.raw}`);

    expect(offenders).toEqual([]);
  });

  it("does not link to path segments that have no detail route", () => {
    const offenders = links.filter((l) => ROUTE_IDENTIFIERS[l.segment] === "none").map((l) => `${l.file}: ${l.raw}`);

    // e.g. `/programs/${prog.slug}` — programs render inside Explore, so the
    // correct href is `/explore?tab=programs&slug=…`.
    expect(offenders).toEqual([]);
  });
});
