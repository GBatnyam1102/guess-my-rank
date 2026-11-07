import type { MetadataRoute } from 'next';
import { THEME_COLORS } from '@/lib/theme-init';

/**
 * Makes the site installable as an app (PWA): home-screen icon, full screen, no browser bar.
 * Served at /manifest.webmanifest; the install UI is components/InstallApp.tsx.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Guess My Rank',
    short_name: 'Guess My Rank',
    description: 'Найзынхаа эрэмбийг тааж оноо цуглуул.',
    lang: 'mn',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
