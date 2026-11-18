import type { NextConfig } from 'next'
import { securityHeaders } from './lib/security-headers'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const headers = securityHeaders({ dev: process.env.NODE_ENV !== 'production', supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL })
    return [{ source: '/:path*', headers }]
  },
}

export default nextConfig
