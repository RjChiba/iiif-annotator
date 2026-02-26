import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: '**' }]
  },
  // @hyzyla/pdfium and sharp are native modules used only in API routes.
  // Marking them as external prevents webpack from bundling them.
  serverExternalPackages: ['@hyzyla/pdfium', 'sharp'],
};

export default nextConfig;
