# CommonGrid — Agent Context

## Identity
This is `TextureHQ/commongrid`, a **separate repo** from `TextureHQ/mono`. Next.js app with Clerk auth, Mapbox maps, Postgres + PostGIS backend. Energy grid data explorer — utilities, programs, transmission lines, pricing nodes.

## Environment
- **Dev server:** `PORT=3060 npm run dev`
- **Database:** Local Postgres 17 with PostGIS at `postgresql://localhost:5432/commongrid_dev`
- **DB driver:** `lib/db/client.ts` conditionally swaps `pg` (node-postgres) for localhost, `@neondatabase/serverless` for Neon URLs. Do NOT break this.
- **Auth:** Clerk dev keys in 1Password (`op://Drive/CommonGrid Clerk Dev Keys/`). Real keys, no bypass needed.
- **Map:** Mapbox token in `.env.local` (`op://Drive/Mapbox CommonGrid/public token`)
- **Tunnel:** `cloudflared tunnel --url http://localhost:3060`

## Worktree convention
- Reference clone: `~/Workspace/commongrid` (never commit here)
- Worktrees: `~/Workspace/commongrid-worktrees/forge/<name>`
- Branch naming: `forge/<descriptive-name>`

## Key paths
- `lib/db/client.ts` — DB driver with local/prod switching
- `lib/auth.ts` — Clerk auth helpers
- `app/` — Next.js App Router pages
- `supabase/migrations/` — SQL migration files
- `components/` — React components
- `.env.example` — template for `.env.local`

## Verification
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3060` → 200
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3060/sign-in` → 200
- `psql -d commongrid_dev -c "SELECT count(*) FROM utilities;"` → > 0

## Related skills
- `commongrid-dev` — full setup and troubleshooting guide
- `cloudflare-tunnel-ui-preview` — tunnel sharing
- `github-pr-workflow` — PR lifecycle