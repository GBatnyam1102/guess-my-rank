import type { Metadata, Viewport } from 'next';
import { MotionProvider } from '@/components/motion';
import { THEME_COLORS, themeInitScript } from '@/lib/theme-init';
import './globals.css';

export const metadata: Metadata = {
  title: 'Guess My Rank',
  description: 'Найзынхаа эрэмбийг тааж оноо цуглуул.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by the inline script before React hydrates.
    <html lang="mn" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
