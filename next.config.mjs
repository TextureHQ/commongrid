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
        {
          source: '/tiles/:z/:x/:y.pbf',
          destination: '/api/tiles/territories/:z/:x/:y',
        },
      ],
    };
  },
};

export default nextConfig;
