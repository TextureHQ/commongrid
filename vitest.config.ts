import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  esbuild: {
    include: [/\.tsx?$/],
    jsx: "automatic",
  },
  test: {
    pool: "threads",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "app/**/*.test.ts", "app/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
    },
  },
});
