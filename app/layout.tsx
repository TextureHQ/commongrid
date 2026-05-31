import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

const clerkAppearance = {
  elements: {
    formButtonPrimary:
      "bg-[--cg-brand] hover:bg-[--cg-brand-hover] text-white font-medium rounded-md transition-colors",
    card: "shadow-lg rounded-xl",
    headerTitle: "text-2xl font-semibold mb-2",
    headerSubtitle: "text-base text-[--color-text-secondary] leading-relaxed mb-6",
    socialButtonsBlockButton: "border border-[--color-border] hover:bg-[--color-bg-hover] rounded-md transition-colors",
    formFieldInput:
      "border border-[--color-border] rounded-md focus:border-[--cg-brand] focus:ring-2 focus:ring-[--cg-brand]/20",
    footerActionLink: "text-[--cg-brand] hover:text-[--cg-brand-hover] font-medium",
    identityPreviewEditButton: "text-[--cg-brand] hover:text-[--cg-brand-hover]",
    formResendCodeLink: "text-[--cg-brand] hover:text-[--cg-brand-hover]",
    otpCodeFieldInput:
      "border border-[--color-border] rounded-md focus:border-[--cg-brand] focus:ring-2 focus:ring-[--cg-brand]/20",
  },
  layout: {
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#2563eb", // CommonGrid brand blue
    colorTextOnPrimaryBackground: "#ffffff",
    borderRadius: "0.5rem",
    spacingUnit: "1rem",
  },
};

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
        <ClerkProvider
          appearance={clerkAppearance}
          localization={{
            signIn: {
              start: {
                title: "Welcome back to CommonGrid",
                subtitle:
                  "Sign in to suggest edits, improve data quality, and help build the most comprehensive registry of US energy infrastructure.",
              },
            },
            signUp: {
              start: {
                title: "Join the CommonGrid community",
                subtitle:
                  "Create an account to contribute edits, track your contributions, and help improve the quality of open energy data.",
              },
            },
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
