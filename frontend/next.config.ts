import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow base64 data URIs and GCS image URLs
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
}

export default nextConfig
