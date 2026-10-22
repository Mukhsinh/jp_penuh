/** @type {import('next').NextConfig} */
const nextConfig = {

  // External packages for server
  serverExternalPackages: ['xlsx'],

  // Enable compression
  compress: true,

  // Experimental features
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Optimize package imports — tree-shake heavy icon libraries
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },

  // Skip build checks for faster deploys
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Images: rely on Next built-in optimization where possible
  images: {
    unoptimized: true, // keep for Vercel free tier compatibility
  },

  // Disable source maps in production (faster builds, smaller bundles)
  productionBrowserSourceMaps: false,

  // Remove console logs in production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Cache headers for static assets
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },

  // Webpack config — server-side shims only
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },

  // Redirect root to login
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
      {
        // Redirect direct access to master-tarif to dashboard
        source: '/master-tarif',
        destination: '/dashboard',
        permanent: false,
      },
      {
        source: '/assesment',
        destination: '/assessment',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig