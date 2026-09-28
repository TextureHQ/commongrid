import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SITE_DESCRIPTION, SITE_URL, SOCIAL_IMAGE } from "@/lib/seo";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: "%s - CommonGrid",
    default: "CommonGrid",
  },
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", siteName: "CommonGrid", images: [SOCIAL_IMAGE] },
  twitter: { card: "summary_large_image", images: [SOCIAL_IMAGE] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
        <link
          href="https://fonts.googleapis.com/css2?family=Rethink+Sans:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
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
        {gaId && (
          <Script
            id="commongrid-ga"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
            strategy="afterInteractive"
          />
        )}
        <Analytics />
      </body>
    </html>
  );
}
