import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Moderation Response Templates — Quick Action Templates
 *
 * Pre-written response templates for common moderation actions.
 * Moderators can select these to quickly fill in return reasons,
 * change requests, and welcome messages without typing from scratch.
 *
 * Global templates (is_global = true) are visible to all moderators.
 * Personal templates (is_global = false) are visible only to their creator.
 */
export const moderationResponseTemplates = pgTable(
  "moderation_response_templates",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    responseText: text("response_text").notNull(),
    /** 'return_reason' | 'changes_requested' | 'welcome' */
    category: text("category").notNull(),
    createdBy: text("created_by").references(() => users.id),
    isGlobal: boolean("is_global").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mod_templates_category").on(table.category)]
);

export type ModerationResponseTemplateSelect =
  typeof moderationResponseTemplates.$inferSelect;
export type ModerationResponseTemplateInsert =
  typeof moderationResponseTemplates.$inferInsert;
