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
  // Bumping edges 1.30.3 → 1.33.2 surfaced this regression. Cron routes also
  // pull data/**.json snapshots into their function bundles via static
  // imports in sync scripts that the tracer follows through child_process
  // boundaries — those snapshots are not needed at runtime since crons fetch
  // fresh data from external sources (EIA, HIFLD, OSM, AFDC).
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
      // Backwards-compat aliases for the legacy `/tiles/{layer}/{z}/{x}/{y}` paths.
      // The tile tree under `public/tiles/` contains only `.pmtiles` archives;
      // individual MVT tiles are generated dynamically by `/api/tiles/...`. These
      // rewrites let existing map clients that still hit `/tiles/...` continue to
      // work without changing their source URLs.
      afterFiles: [
        // Territories
        { source: '/tiles/territories/:z/:x/:y.pbf', destination: '/api/tiles/territories/:z/:x/:y' },
        { source: '/tiles/territories/:z/:x/:y', destination: '/api/tiles/territories/:z/:x/:y' },
        // Power plants
        { source: '/tiles/power-plants/:z/:x/:y.pbf', destination: '/api/tiles/power-plants/:z/:x/:y' },
        { source: '/tiles/power-plants/:z/:x/:y', destination: '/api/tiles/power-plants/:z/:x/:y' },
        // Substations
        { source: '/tiles/substations/:z/:x/:y.pbf', destination: '/api/tiles/substations/:z/:x/:y' },
        { source: '/tiles/substations/:z/:x/:y', destination: '/api/tiles/substations/:z/:x/:y' },
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
  org: 'texture',
  project: 'commongrid',
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress source map upload logs
  silent: !process.env.CI,

  // Source map upload must not break the build (forks and local builds have no
  // auth token at all), but a *misconfigured* token in a real deployment used
  // to fail silently for months. Warn loudly and distinguish the two cases.
  //
  // History: from 2026-04 to 2026-08 every production build failed upload with
  // `403 You do not have permission to perform this action` because the Vercel
  // SENTRY_AUTH_TOKEN lacked release scopes. Because the message was a plain
  // `console.warn`, nobody noticed, and every stack trace in Sentry was
  // unsymbolicated minified output.
  errorHandler: (err) => {
    if (!process.env.SENTRY_AUTH_TOKEN) {
      console.warn(
        '[sentry] Skipping source map upload: SENTRY_AUTH_TOKEN is not set. ' +
          'Stack traces from this build will not be symbolicated.'
      );
      return;
    }

    console.error(
      '\n' +
        '='.repeat(78) +
        '\n[sentry] SOURCE MAP UPLOAD FAILED \u2014 stack traces from this build will be\n' +
        '[sentry] unreadable minified output in Sentry.\n' +
        `[sentry] Reason: ${err.message}\n` +
        '[sentry] A 403 means SENTRY_AUTH_TOKEN is missing the `project:releases`\n' +
        '[sentry] scope. Rotate it at https://sentry.io/settings/account/api/auth-tokens/\n' +
        '='.repeat(78) +
        '\n'
    );
  },

  // Tree-shake Sentry's own debug logging out of production bundles.
  // (Replaces the deprecated top-level `disableLogger` option.)
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },

  // Hide source maps from users
  hideSourceMaps: true,

  // Widen upload scope to include utility modules
  widenClientFileUpload: true,

  // Route browser telemetry through our own domain so ad blockers and
  // privacy extensions do not silently drop error reports. This was another
  // source of missing events: 11 `network_error` client discards in 90 days.
  tunnelRoute: '/monitoring',
});
