/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  ...(isProd ? { output: 'export' } : {}),

  images: {
    unoptimized: true,
  },

  // Only active in dev (not in static export)
  ...(!isProd ? {
    async rewrites() {
      return [
        {
          source: '/uploads/:path*',
          destination: 'http://localhost:4000/uploads/:path*',
        },
      ];
    }
  } : {}),

  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  },

  trailingSlash: true,
};

module.exports = nextConfig;