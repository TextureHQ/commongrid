import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    template: "%s - CommonGrid",
    default: "CommonGrid",
  },
  description: "Community-maintained energy knowledge base",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for theme initialization
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const mode = localStorage.getItem('colorModePreference') || 'system';
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const shouldBeDark = mode === 'dark' || (mode === 'system' && prefersDark);
                if (shouldBeDark) {
                  document.documentElement.classList.add('theme-dark');
                }
              })()
            `,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
