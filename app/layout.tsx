import { ClerkProvider } from "@clerk/nextjs";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Rethink+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
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
        <ClerkProvider>
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
