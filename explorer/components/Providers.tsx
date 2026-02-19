"use client";

import { BrandProvider, ColorModeProvider, NoticeProvider } from "@texturehq/edges";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const CONTEXT_EXPLORER_BRAND_VARIABLES = {
  "--color-brand-primary": "#2563eb",
  "--color-brand-dark": "#1d4ed8",
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary level="page" title="Application Error">
      <ColorModeProvider>
        <BrandProvider variables={CONTEXT_EXPLORER_BRAND_VARIABLES}>
          <NoticeProvider>{children}</NoticeProvider>
        </BrandProvider>
      </ColorModeProvider>
    </ErrorBoundary>
  );
}
