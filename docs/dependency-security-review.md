# Dependency security review — 2026-09-25

This launch patch updates compatible direct dependencies and regenerates the lockfile. It does not claim that every dependency is on its latest major version or that an audit proves the application is secure.

## Changes

- Next.js 15.5.9 → 15.5.26 removes the framework advisories reported against the previous lockfile without a Next.js 16 migration.
- Refresh compatible application and development dependencies, including React, Clerk, Sentry, Tailwind, Drizzle, Upstash, Zod, Playwright and Vitest.
- Override Next.js's pinned PostCSS with the direct patched version (8.5.28). Relevant advisories include GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp and GHSA-r28c-9q8g-f849.
- Override esbuild to 0.28.2 across the tree. This removes GHSA-67mh-4wv8-2f99 from Drizzle's legacy loader and keeps Vite's esbuild requirement satisfied. Build, tests and loading the Drizzle TypeScript config were exercised with this override; no database migration was executed.
- Add explicit PostgreSQL type declarations required by the updated dependency graph.
- Migrate Biome configuration and reformat one existing test to satisfy the upgraded formatter. No test assertions or application routes change.

## Audit result and unresolved exception

The starting full npm audit reported 23 affected-package entries: 1 critical, 8 high, 14 moderate. These are dependency findings, not 23 demonstrated application exploits.

After a clean `npm ci`:

- `npm audit --omit=dev`: zero findings, exit 0.
- `npm audit`: one high-severity affected-package entry, exit 1: `xlsx` 0.18.5.

SheetJS advisories: [prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) and [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9). The npm package has no patched release; the advisories require at least 0.20.2 for both fixes. The package is a development dependency used by EIA spreadsheet sync scripts, so the production-only audit excludes it, but data ingestion remains exposed to malicious input. Do not treat this as resolved or harmless.

The publisher's `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` could not be fetched from the verification environment (`curl`: connection reset). This patch does not substitute an unverified mirror or suppress the advisory. Follow-up requires obtaining and verifying the publisher release, updating the lockfile, and testing representative EIA workbooks, or migrating the parser with equivalent fixture coverage.

`@clerk/testing` remains pinned at 2.2.23: npm advertised 2.2.39, but its registry tarball returned HTTP 404 during installation.

## Deliberately deferred breaking upgrades

At audit time, newer breaking releases included Next.js 16, Sentry 11, Edges 5, Edges tokens 0.5, react-map-gl 8, Svix 2, TypeScript 7, Vitest/coverage 5, jsdom 30 and Node types 26. These need separate compatibility work and browser rehearsal rather than a forced launch-eve migration. This patch raises versions within existing compatible release lines wherever installable.

The repository uses `legacy-peer-deps=true`. `npm ls --all` is not clean: it reports Edges/Explore and Visx/React peer-range mismatches, a missing webpack peer for the Sentry plugin, and extraneous optional Sharp/WASM packages. Successful build/tests do not establish that every peer contract is satisfied. In particular, preview map, chart and authentication flows still need browser validation.

## Verification

Local environment: Node 22.23.3, npm 10.9.4; hosted CI uses Node 20 and remains a separate gate.

Passed: clean `npm ci`, `npm run lint`, `npm run lint:biome` (eight warnings, exit 0), `npm test` (1,038 passed / 11 skipped), `npm run test:coverage`, `npm run build`, `npm run openapi:check`, and `npm run db:check-journal`. The legacy esbuild-kit loader successfully imported `drizzle.config.ts` with the override.

Not passed or not verified:

- `npm run test:api`: no local API server or configured database; fails with missing `DATABASE_URL`.
- Additional `drizzle-kit check` reports `drizzle/meta/0005_snapshot.json data is malformed`; this patch does not alter migration snapshots. The project's declared migration-journal check passes. Migration execution is not verified.
- Playwright Chromium installation failed with `ECONNRESET` from `cdn.playwright.dev`; desktop/mobile interactive smoke tests could not run.
- Full dependency audit retains the SheetJS finding above.

Before release, require current-head hosted checks, preview browser verification, and human review. Nothing in this patch provisions infrastructure, writes production data, or deploys outside CI/CD.
