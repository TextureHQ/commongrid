import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
