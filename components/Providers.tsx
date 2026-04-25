"use client";

import { BrandProvider, ColorModeProvider, NoticeProvider } from "@texturehq/edges";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const COMMONGRID_BRAND_VARIABLES = {
  "--color-brand-primary": "#2563eb",
  "--color-brand-dark": "#1d4ed8",
  // Warm neutral text — all pass WCAG AA on white
  "--color-text-heading": "#111111",
  "--color-text-body": "#2c2a26",
  "--color-text-muted": "#5c5549",       // ~6.5:1 — secondary text, meta
  "--color-text-caption": "#6b6155",     // ~6.1:1 — labels, timestamps, eyebrows
  "--color-text-subtle": "#6b6155",      // ~6.1:1 — field labels, breadcrumbs
  // Warm borders
  "--color-border-default": "#e5dfd3",
  "--color-border-muted": "#e5dfd3",
};

const COMMONGRID_DARK_VARIABLES = {
  "--color-brand-primary": "#60a5fa",
  "--color-brand-dark": "#93c5fd",
  "--color-text-heading": "#faf7f0",
  "--color-text-body": "#e5dfd3",
  "--color-text-muted": "#a89f90",
  "--color-text-caption": "#857b6b",
  "--color-text-subtle": "#857b6b",
  "--color-border-default": "#2f2b24",
  "--color-border-muted": "#2f2b24",
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary level="page" title="Application Error">
      <ColorModeProvider>
        <BrandProvider variables={COMMONGRID_BRAND_VARIABLES} darkVariables={COMMONGRID_DARK_VARIABLES}>
          <NoticeProvider>{children}</NoticeProvider>
        </BrandProvider>
      </ColorModeProvider>
    </ErrorBoundary>
  );
}
