/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/health',     destination: `${API}/health` },
    ];
  },
};

module.exports = nextConfig;
