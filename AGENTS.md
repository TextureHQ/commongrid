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

## Verification
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3060` → 200
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3060/sign-in` → 200
- `psql -d commongrid_dev -c "SELECT count(*) FROM utilities;"` → > 0

## Related skills
- `commongrid-dev` — full setup and troubleshooting guide
- `cloudflare-tunnel-ui-preview` — tunnel sharing
- `github-pr-workflow` — PR lifecycle