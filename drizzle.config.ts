import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Neon sets both, and recommends a direct connection for schema changes.
    // `||` so an empty value falls through rather than counting as set.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
  tablesFilter: ["!spatial_ref_sys", "!geography_columns", "!geometry_columns"],
});
