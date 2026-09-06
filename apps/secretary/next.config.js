/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["picsum.photos"],
  },
  async rewrites() {
    return [
      {
        source: '/diaspora/:path*',
        destination: 'http://localhost:3000/diaspora/:path*',
      },
      {
        source: '/api/auth/:path*',
        destination: 'http://localhost:3000/auth/:path*',
      },
      {
        source: '/api/secretary/:path*',
        destination: 'http://localhost:3000/secretary/:path*',
      },
    ]
  },
};
module.exports = nextConfig;
