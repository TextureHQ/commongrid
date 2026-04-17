/**
 * Default moderation response templates.
 *
 * These are seeded into the moderation_response_templates table when
 * the first moderator accesses the templates endpoint and the table is empty,
 * or can be explicitly seeded via a script.
 *
 * See docs/specs/community-contributions-api-erd.md §3.15
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { moderationResponseTemplates } from "@/lib/db/schema";

export const DEFAULT_TEMPLATES = [
  // Return reasons
  {
    name: "Missing Source",
    responseText:
      "Thank you for your contribution! Unfortunately, we need a verifiable source URL for this change. Please add a link to an EIA filing, utility website, state PUC document, or other official source and resubmit.",
    category: "return_reason" as const,
  },
  {
    name: "Stale Data",
    responseText:
      "The source cited for this change appears to be outdated. CommonGrid prioritizes the most recent data available. Please provide a more current source, or note in your edit summary why this older data is more accurate.",
    category: "return_reason" as const,
  },
  {
    name: "Duplicate Contribution",
    responseText:
      "This change has already been submitted or applied by another contributor. Thank you for keeping CommonGrid accurate — your effort is appreciated even if this particular edit was already covered!",
    category: "return_reason" as const,
  },
  {
    name: "Insufficient Edit Summary",
    responseText:
      "Your edit summary doesn't provide enough context for reviewers. Please resubmit with a detailed summary explaining what changed and why, including any relevant context about the source.",
    category: "return_reason" as const,
  },

  // Changes requested
  {
    name: "Needs Better Source",
    responseText:
      "This looks like a valid change, but we'd like a stronger source. Could you provide a direct link to the official document (EIA filing, utility report, PUC order, etc.) rather than a secondary source? This helps us maintain data provenance.",
    category: "changes_requested" as const,
  },
  {
    name: "Partial Update",
    responseText:
      "This update appears correct but incomplete. Could you also update the related fields to keep the data consistent? For example, if you're updating capacity, please also check that the status and operational date are current.",
    category: "changes_requested" as const,
  },
  {
    name: "Value Needs Verification",
    responseText:
      "The value you've provided differs significantly from our current data. This might be correct, but could you double-check the number and confirm? If the change is large, adding context in the edit summary about why would help us approve faster.",
    category: "changes_requested" as const,
  },

  // Welcome messages
  {
    name: "First Contribution Welcome",
    responseText:
      "Welcome to CommonGrid! 🧭 Thank you for your first contribution. Our moderators will review it shortly. In the meantime, feel free to explore more entities and submit additional improvements. Every edit helps make the grid more transparent.",
    category: "welcome" as const,
  },
  {
    name: "Trusted Contributor Promotion",
    responseText:
      "Congratulations! Based on the quality and consistency of your contributions, you've been promoted to Trusted Contributor status. Your edits to non-critical fields will now be auto-approved. Thank you for your dedication to CommonGrid!",
    category: "welcome" as const,
  },
];

/**
 * Seed default templates if the table is empty.
 * Safe to call multiple times — only inserts if no templates exist.
 */
export async function seedDefaultTemplates(): Promise<number> {
  const db = getDb();

  // Check if templates already exist
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(moderationResponseTemplates);

  if (Number(count) > 0) {
    return 0; // Already seeded
  }

  // Insert defaults
  const values = DEFAULT_TEMPLATES.map((t) => ({
    name: t.name,
    responseText: t.responseText,
    category: t.category,
    isGlobal: true,
    createdBy: null, // System-created, no user
  }));

  await db.insert(moderationResponseTemplates).values(values);

  return values.length;
}
