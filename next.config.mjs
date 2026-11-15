/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standard Next.js build — no standalone, no Docker.
  // Deployed directly to Vercel as a normal Next.js project.
  reactStrictMode: true,

  images: {
    // Extend if profile images are added later.
    domains: [],
  },

  // Silence the "x-nonce" header warning from Next.js when reading custom
  // request headers that we set in middleware.
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

export default nextConfig;
