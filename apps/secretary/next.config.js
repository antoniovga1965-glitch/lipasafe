/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const nextConfig = {
  images: {
    domains: ["picsum.photos"],
  },
  async rewrites() {
    return [
      {
        source: '/diaspora/:path*',
        destination: `${API_URL}/diaspora/:path*`,
      },
      {
        source: '/api/auth/:path*',
        destination: `${API_URL}/auth/:path*`,
      },
      {
        source: '/api/secretary/:path*',
        destination: `${API_URL}/secretary/:path*`,
      },
    ]
  },
};
module.exports = nextConfig;
