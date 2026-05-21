"use client";

import { BrandProvider, ColorModeProvider, NoticeProvider } from "@texturehq/edges";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const COMMONGRID_BRAND_VARIABLES = {
  "--color-brand-primary": "#2563eb",
  "--color-brand-dark": "#1d4ed8",
};

const COMMONGRID_DARK_VARIABLES = {
  "--color-brand-primary": "#60a5fa",
  "--color-brand-dark": "#93c5fd",
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
