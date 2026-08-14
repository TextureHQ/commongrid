# CommonGrid — Agent Context

## Identity
This is `TextureHQ/commongrid`, a **separate repo** from `TextureHQ/mono`. Next.js app with Clerk auth, Mapbox maps, Postgres + PostGIS backend. Energy grid data explorer — utilities, programs, transmission lines, pricing nodes.

## Environment
- **Dev server:** `PORT=3060 npm run dev`
- **Database:** Local Postgres 17 with PostGIS at `postgresql://localhost:5432/commongrid_dev`
- **DB driver:** `lib/db/client.ts` conditionally swaps `pg` (node-postgres) for localhost, `@neondatabase/serverless` for Neon URLs. Do NOT break this.
- **Auth:** Clerk dev keys in 1Password (`op://Drive/CommonGrid Clerk Dev Keys/`). Real keys, no bypass needed.
- **Map:** Mapbox token in `.env.local` (`op://Drive/Mapbox CommonGrid/public token`)
- **Cursor pagination:** `CURSOR_SECRET` must be set in `.env.local` (any value locally). See `.env.example`.
- **Tunnel:** `cloudflared tunnel --url http://localhost:3060`

## Worktree convention
- Reference clone location is per-developer (e.g. `~/Workspace/commongrid`, `~/work/texture/commongrid`) — never commit from it
- Worktrees: `<reference-clone>-worktrees/<prefix>/<name>`
- Branch naming: `<prefix>/<descriptive-name>`, where the prefix identifies the operator (`forge/`, `meridian/`, `sergey/`)

## Key paths
- `lib/db/client.ts` — DB driver with local/prod switching
- `lib/auth.ts` — Clerk auth helpers
- `app/` — Next.js App Router pages
- `components/` — React components
- `drizzle/` — SQL migration files
- `.env.example` — template for `.env.local`

## Migrations
- Write SQL into `drizzle/` and add a matching entry to `drizzle/meta/_journal.json`. Only journalled files are ever applied.
- Use `Date.now()` for a hand-written entry's `when`. drizzle decides what to apply from the highest `when` already applied, so a migration whose timestamp is below that is skipped and never runs.
- `npm run db:migrate` applies them (`drizzle-kit migrate`), against `DATABASE_URL_UNPOOLED` when set.
- **Applied by the Vercel build**, as the last step of `buildCommand`. Not by hand. A failed migration fails the build, so the deployment is never promoted.
- Each Vercel environment has its own Neon branch, so a preview build only migrates its own database. **If they are ever collapsed onto a shared `DATABASE_URL`, revert the build-time migration first.**
- Migrations run **after** `next build`, so a failure leaves the schema untouched. This assumes the build does not read the database — **if `generateStaticParams` or `force-static` is ever added, move the migration before `next build`.**
- **Migrations must be backward-compatible.** They land while the previous deployment is still serving. Add nullable columns and new tables; never drop or rename in the same release as the code change.
- **Large backfills do not belong in `drizzle/`** — the build has a timeout. Run them out-of-band as scripts.
- **Never run `drizzle-kit push` against a shared database.** `lib/db/schema/` does not describe the whole database — `utility_resolver_cache` and `utility_name_manual_overrides` exist but are not declared, and push would offer to drop them. `generate` is safe.

## Verification
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3060` → 200
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3060/sign-in` → 200
- `psql -d commongrid_dev -c "SELECT count(*) FROM utilities;"` → > 0

## Related skills
- `commongrid-dev` — full setup and troubleshooting guide
- `cloudflare-tunnel-ui-preview` — tunnel sharing
- `github-pr-workflow` — PR lifecycle