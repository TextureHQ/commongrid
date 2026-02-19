import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: {
    template: "%s - OpenGrid",
    default: "OpenGrid",
  },
  description: "Community-maintained energy knowledge base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
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
