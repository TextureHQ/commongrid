import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
    },
  },
});
