import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(import.meta.dirname, '..');

const nextConfig: NextConfig = {
  transpilePackages: ['@gmr/shared'],
  turbopack: {
    root: workspaceRoot,
  },
  // The Docker image (Dockerfile, target web) sets NEXT_OUTPUT=standalone; local `pnpm build` is unchanged.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: workspaceRoot,
  // Lets phones on the same Wi-Fi open the dev server (e.g. http://192.168.1.20:3000).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*'],
};

export default nextConfig;
