import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";

/** Public upstream registry. Authority/recency resolution is a separate policy. */
export const dataSources = pgTable(
  "data_sources",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    authorityTier: text("authority_tier").notNull(),
    /** Expected publication cadence, not our polling frequency. */
    cadence: text("cadence").notNull(),
    homepageUrl: text("homepage_url"),
    /** Null means unverified/unspecified, not unrestricted reuse. */
    license: text("license"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    check(
      "data_sources_authority_tier_check",
      sql`${table.authorityTier} IN ('federal', 'state', 'community', 'derived')`
    ),
    check("data_sources_cadence_check", sql`${table.cadence} IN ('annual', 'monthly', 'irregular', 'on-demand')`),
  ]
);

export type DataSourceSelect = typeof dataSources.$inferSelect;
export type DataSourceInsert = typeof dataSources.$inferInsert;
