import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep serverless function bundles under Vercel's 250MB unzipped limit.
  // Without this, API routes that transitively import from @texturehq/edges
  // (e.g. via shared TypeScript types) pull in mapbox-gl + visx + tiptap +
  // ace-builds + framer-motion + filestack and balloon past the limit.
  // Bumping edges 1.30.3 → 1.33.2 surfaced this regression.
  outputFileTracingExcludes: {
    "app/api/**": [
      "node_modules/mapbox-gl/**",
      "node_modules/react-map-gl/**",
      "node_modules/@visx/**",
      "node_modules/@tiptap/**",
      "node_modules/ace-builds/**",
      "node_modules/react-ace/**",
      "node_modules/framer-motion/**",
      "node_modules/filestack-react/**",
      "node_modules/lucide-react/**",
      "node_modules/d3-array/**",
      "node_modules/@phosphor-icons/**",
      "node_modules/react-aria-components/**",
      "node_modules/react-stately/**",
      "node_modules/@dnd-kit/**",
      "node_modules/papaparse/**",
      "node_modules/file-saver/**",
      "node_modules/next-intl/**",
      "node_modules/luxon/**",
      "node_modules/date-fns/**",
      "node_modules/@tanstack/react-virtual/**",
      "node_modules/react-colorful/**",
      "node_modules/@texturehq/edges/dist/index.js",
    ],
    // Cron routes spawn sync scripts via child_process; the tracer follows
    // the scripts' static imports of data/*.json and bundles ~150MB of
    // committed snapshots into the function. At runtime the cron fetches
    // fresh data from external sources (EIA, HIFLD, OSM, AFDC) — the bundled
    // snapshots are not needed in the serverless function. Excluding them
    // drops /api/cron/sync-substations from 262MB → ~110MB, well under the
    // 250MB Vercel limit. Edges 1.30.3 → 1.33.2 bump nudged this over the
    // edge; the cron route had been overweight for some time.
    "app/api/cron/**": [
      "data/**",
      "node_modules/mapbox-gl/**",
      "node_modules/react-map-gl/**",
      "node_modules/@visx/**",
      "node_modules/@tiptap/**",
      "node_modules/ace-builds/**",
      "node_modules/react-ace/**",
      "node_modules/framer-motion/**",
      "node_modules/filestack-react/**",
      "node_modules/lucide-react/**",
      "node_modules/@phosphor-icons/**",
      "node_modules/react-aria-components/**",
      "node_modules/react-stately/**",
      "node_modules/@dnd-kit/**",
      "node_modules/@texturehq/edges/dist/index.js",
    ],
  },
  async headers() {
    return [
      {
        source: '/tiles/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Content-Type', value: 'application/x-protobuf' },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      // afterFiles rewrites only trigger when no static file matches,
      // so zoom 0-10 (static tiles) are served directly, zoom 11+
      // falls through to the API route for dynamic generation.
      afterFiles: [
        // Territories
        { source: '/tiles/territories/:z/:x/:y.pbf', destination: '/api/tiles/territories/:z/:x/:y' },
        { source: '/tiles/territories/:z/:x/:y', destination: '/api/tiles/territories/:z/:x/:y' },
        // Power plants
        { source: '/tiles/power-plants/:z/:x/:y.pbf', destination: '/api/tiles/power-plants/:z/:x/:y' },
        { source: '/tiles/power-plants/:z/:x/:y', destination: '/api/tiles/power-plants/:z/:x/:y' },
        // EV charging stations
        { source: '/tiles/ev-charging/:z/:x/:y.pbf', destination: '/api/tiles/ev-charging/:z/:x/:y' },
        { source: '/tiles/ev-charging/:z/:x/:y', destination: '/api/tiles/ev-charging/:z/:x/:y' },
        // Transmission lines
        { source: '/tiles/transmission-lines/:z/:x/:y.pbf', destination: '/api/tiles/transmission-lines/:z/:x/:y' },
        { source: '/tiles/transmission-lines/:z/:x/:y', destination: '/api/tiles/transmission-lines/:z/:x/:y' },
        // Pricing nodes
        { source: '/tiles/pricing-nodes/:z/:x/:y.pbf', destination: '/api/tiles/pricing-nodes/:z/:x/:y' },
        { source: '/tiles/pricing-nodes/:z/:x/:y', destination: '/api/tiles/pricing-nodes/:z/:x/:y' },
      ],
    };
  },
};

export default withSentryConfig(nextConfig, {
  // Upload source maps to Sentry for readable stack traces
  org: "texture",
  project: "commongrid",
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress source map upload logs
  silent: !process.env.CI,

  // Don't fail the build if source map upload fails (e.g. missing auth token)
  errorHandler: (err) => {
    console.warn('Sentry source map upload warning:', err.message);
  },

  // Automatically tree-shake Sentry logger statements
  disableLogger: true,

  // Hide source maps from users
  hideSourceMaps: true,

  // Widen upload scope to include utility modules
  widenClientFileUpload: true,
});
