"use client";

import { BrandProvider, ColorModeProvider, NoticeProvider } from "@texturehq/edges";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// CommonGrid brand colors derived from edges tokens
// Use iris-base (blue) for brand identity
const COMMONGRID_BRAND_VARIABLES = {
  "--color-brand-primary": "var(--color-iris-base)",
  "--color-brand-dark": "var(--color-iris-base)",
};

const COMMONGRID_DARK_VARIABLES = {
  "--color-brand-primary": "var(--color-iris-base)",
  "--color-brand-dark": "var(--color-iris-base)",
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
