/** @type {import('next').NextConfig} */
const nextConfig = {
  // React Compiler for optimized builds
  reactCompiler: true,

  // Optimize package imports — tree-shake large icon/component libraries
  experimental: {
    optimizePackageImports: [
      '@heroicons/react/24/outline',
      '@heroicons/react/24/solid',
      '@heroicons/react/20/solid',
      'react-hot-toast',
    ],
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.blob.vercel-storage.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        pathname: '/**',
      },
    ],
    // Optimize images for production
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header for security
  // compress: false — Vercel Edge handles brotli/gzip with streaming support.
  // Node.js gzip (compress:true) buffers the full response before sending, which
  // kills React Suspense streaming and causes high FCP. Vercel CDN applies
  // streaming-compatible compression automatically.
  compress: false,
  
  // Strict mode only in production (doubles renders in dev intentionally)
  reactStrictMode: process.env.NODE_ENV === 'production',

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        // Cache static assets
        source: '/uploads/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Logging for production debugging
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
};

export default nextConfig;
