/**
 * Guards the per-route metadata contract (CIR-1291).
 *
 * Every page under `app/(shell)/` used to inherit the root layout's
 * `title.default` ("CommonGrid") because nearly all of them are client
 * components, and client components cannot export `metadata`. The fix is a
 * sibling server `layout.tsx` per route (or `generateMetadata` for dynamic
 * detail routes), with the brand suffix supplied *only* by the root layout's
 * `title.template`.
 *
 * Two ways that regresses silently, both asserted here:
 *
 *  1. A new route ships with no metadata anywhere in its ancestor chain, so it
 *     falls back to the bare "CommonGrid" default. Nothing errors — the title
 *     is just wrong, on a page nobody re-checks.
 *  2. Someone hardcodes the brand ("... | CommonGrid" / "... - CommonGrid") in
 *     a route's own metadata. The root template then appends it a second time,
 *     yielding "Substation | CommonGrid - CommonGrid". This is exactly what
 *     stale `generateMetadata` exports in `substations/[slug]/page.tsx` and
 *     `transmission-lines/[id]/page.tsx` were doing: a `generateMetadata` in
 *     `page.tsx` takes precedence over the correct sibling `layout.tsx`, so the
 *     good layout was dead code.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SHELL_ROOT = join(process.cwd(), "app/(shell)");

const METADATA_EXPORT = /export\s+(?:const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/;

/** Routes intentionally served by the root layout's `title.default`. */
const ROOT_DEFAULT_ROUTES = new Set(["."]);

function walkRouteDirs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkRouteDirs(full));
  }
  if (readdirSync(dir).includes("page.tsx")) out.push(dir);
  return out;
}

const routeDirs = walkRouteDirs(SHELL_ROOT);
const routeIds = routeDirs.map((d) => relative(SHELL_ROOT, d) || ".");

/**
 * Blanks out comment bodies while preserving line numbering, so prose about the
 * brand suffix (including the pointers left in the two detail `page.tsx` files)
 * doesn't read as a violation. Only real code is scanned.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length));
}

function declaresMetadata(file: string): boolean {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return METADATA_EXPORT.test(source);
}

/** Nearest ancestor (inclusive) whose layout.tsx declares metadata. */
function metadataOwner(routeDir: string): string | null {
  let cur = routeDir;
  for (;;) {
    if (declaresMetadata(join(cur, "layout.tsx"))) return relative(SHELL_ROOT, cur) || ".";
    if (cur === SHELL_ROOT) return null;
    cur = join(cur, "..");
  }
}

describe("per-route metadata (CIR-1291)", () => {
  it("finds the shell routes it means to be guarding", () => {
    // Sanity floor: if the walker silently matches nothing, every it.each below
    // vacuously passes and this suite becomes decoration.
    expect(routeDirs.length).toBeGreaterThan(20);
  });

  it.each(routeIds.filter((id) => !ROOT_DEFAULT_ROUTES.has(id)))("%s resolves a per-route <title>", (routeId) => {
    const routeDir = join(SHELL_ROOT, routeId);
    const owner = metadataOwner(routeDir);

    expect(
      owner,
      `Route app/(shell)/${routeId} has no metadata in its own or any ancestor layout, so it renders the bare "CommonGrid" default. Add a sibling server layout.tsx exporting metadata built from @/lib/metadata.`
    ).not.toBeNull();
    expect(
      owner,
      `Route app/(shell)/${routeId} only inherits metadata from the (shell) root, so its <title> is not route-specific.`
    ).not.toBe(".");
  });

  it.each(routeIds)("%s does not hardcode the CommonGrid brand suffix", (routeId) => {
    const routeDir = join(SHELL_ROOT, routeId);
    for (const file of ["page.tsx", "layout.tsx"]) {
      let source: string;
      try {
        source = readFileSync(join(routeDir, file), "utf8");
      } catch {
        continue;
      }
      const offenders = stripComments(source)
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => /title/i.test(line) && /[|-]\s*CommonGrid/.test(line));

      expect(
        offenders.map(([n, line]) => `${file}:${n}: ${line.trim()}`),
        `Route app/(shell)/${routeId} hardcodes the brand in a title. The root layout's title.template already appends " - CommonGrid", so this double-suffixes.`
      ).toEqual([]);
    }
  });

  it.each(routeIds)("%s does not shadow its sibling layout metadata from page.tsx", (routeId) => {
    const routeDir = join(SHELL_ROOT, routeId);
    // A generateMetadata/metadata export in page.tsx wins over layout.tsx. When
    // both exist the layout is dead code, which is how the stale hardcoded
    // titles survived unnoticed.
    if (!declaresMetadata(join(routeDir, "layout.tsx"))) return;

    expect(
      declaresMetadata(join(routeDir, "page.tsx")),
      `app/(shell)/${routeId} declares metadata in BOTH layout.tsx and page.tsx. page.tsx takes precedence, making the layout dead code. Keep metadata in layout.tsx only.`
    ).toBe(false);
  });
});

describe("title registry", () => {
  it("never appends the brand — the root template owns that", async () => {
    const { PAGE_TITLES, buildTitle, buildMetadata } = await import("@/lib/metadata");

    for (const [key, value] of Object.entries(PAGE_TITLES)) {
      expect(value, `PAGE_TITLES.${key} must not include the brand suffix`).not.toMatch(/CommonGrid/);
    }
    expect(buildTitle("Diablo Canyon", PAGE_TITLES.powerPlants)).toBe("Diablo Canyon - Power Plants");
    expect(buildTitle("Power Plants")).toBe("Power Plants");
    expect(buildMetadata({ title: "Power Plants" }).title).not.toMatch(/CommonGrid/);
  });

  it("mirrors the title into openGraph so unfurls match the tab", async () => {
    const { buildMetadata, PAGE_TITLES } = await import("@/lib/metadata");
    const meta = buildMetadata({ title: "Diablo Canyon", section: PAGE_TITLES.powerPlants, description: "d" });
    expect(meta.openGraph?.title).toBe("Diablo Canyon - Power Plants");
  });
});
