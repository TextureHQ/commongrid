# Search and social metadata

CommonGrid's production origin is `https://commongrid.info`, defined in
`lib/seo.ts`. Crawler URLs never use request headers or preview hostnames.

## Social previews

The homepage exports its own canonical, Open Graph and Twitter large-image
metadata from its server page; the existing interactive UI lives unchanged in
`HomePageClient.tsx`. The canonical is deliberately not in a shared layout:
entity pages must not claim that the homepage is their canonical URL.

`/social-image` is a statically built 1200×630 PNG using Next.js ImageResponse,
the existing CommonGrid logo, and existing homepage map artwork. It requires no
API, database, external font, or Mapbox request. Colors match the Edges light
paper/heading/border tokens; Edges client components cannot render in Satori.
The shared metadata builder retains entity-specific titles and descriptions
while adding the common image. Existing entity routes are not canonicalized or
otherwise restructured by this change.

## Indexing policy

- `/sitemap.xml` is a curated list of public entry points, not an exhaustive
  entity dump. No build-time database queries or invented modification dates.
  Add new public surfaces to `SITEMAP_PATHS` deliberately; rates can follow when
  the launch implementation is ready.
- `/robots.txt` allows public pages and points at the production sitemap. It
  excludes API data, tiles, and telemetry from crawl budgets. `/api` (the public
  API reference page) remains allowed; `/api/` (machine endpoints) is excluded.
- Auth, account, moderation, demo, dataset-submission and new-entity editor
  routes receive `X-Robots-Tag: noindex, nofollow` from middleware. These pages
  are not disallowed in robots.txt, because crawlers must fetch them to read
  that directive. Clerk's existing access-control behavior is unchanged.
- `/developers` intentionally receives noindex: its public overview and private
  API-key dashboard share the same route. Splitting those surfaces would allow
  the overview to be indexed independently in a future change.
- Noindex and robots are crawler hints, never security controls. Preview
  deployment protection remains the hosting platform's responsibility.

## Verification

Unit tests cover metadata, sitemap policy, path boundaries, and HTTP middleware
headers. Before launch, inspect server-rendered HTML with a crawler user agent:

```sh
curl -A 'Twitterbot/1.0' https://commongrid.info/
curl -I https://commongrid.info/social-image
curl https://commongrid.info/robots.txt
curl https://commongrid.info/sitemap.xml
curl -I https://commongrid.info/developers
```

Verify that the PNG is legible at thumbnail size and in desktop/mobile previews.
Use LinkedIn Post Inspector and an actual Slack/X share after deployment; local
HTTP checks cannot establish third-party rendering or refresh their caches.
Production-absolute image URLs intentionally do not point at a preview deploy,
so a platform preview of an unmerged change cannot validate the new image until
that image exists on production. The image endpoint itself can be inspected on
the PR's preview deployment.
