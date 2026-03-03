/** @type {import('next').NextConfig} */
// ──────────────────────────────────────────────────────────────────────────────
// CPANEL DEPLOYMENT:
// 1. Change NEXT_PUBLIC_API_URL below to your real backend URL
// 2. Run: npm run build  on your LOCAL Mac
// 3. Upload contents of the generated "out/" folder → to cPanel public_html/
// ──────────────────────────────────────────────────────────────────────────────

const nextConfig = {
  // Required for cPanel shared hosting — generates static HTML/CSS/JS
  output: 'export',

  images: {
    unoptimized: true,
  },

  // ── CHANGE THIS before building ────────────────────────────────────────────
  // Your backend API URL — e.g. https://yourdomain.com:4000/api
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://yourdomain.com:4000/api',
  },

  trailingSlash: true,
};

module.exports = nextConfig;
