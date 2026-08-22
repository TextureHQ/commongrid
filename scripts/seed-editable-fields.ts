#!/usr/bin/env tsx

/**
 * Seed community_editable_fields table
 *
 * Populates field definitions for all entity types: utilities, power-plants,
 * ev-stations, pricing-nodes, programs.
 *
 * The field definitions themselves live in lib/community-editable-fields/definitions.ts
 * so that tests and runtime validation can import the same list this script
 * writes. Do not add field definitions here.
 *
 * Usage:
 *   export DATABASE_URL=$(HOME=/var/tmp/op-agent op read "op://Fleet Secrets/CommonGrid Neon DB/password")
 *   tsx scripts/seed-editable-fields.ts
 */

import { sql } from "drizzle-orm";
import { editableFieldDefinitions } from "../lib/community-editable-fields/definitions";
import { db } from "../lib/db/client";
import { communityEditableFields } from "../lib/db/schema/community-editable-fields";

async function seedEditableFields() {
  console.log("🌱 Seeding community_editable_fields...");

  // Clear existing data
  await db.execute(sql`DELETE FROM community_editable_fields`);
  console.log("   Cleared existing field definitions");

  // Insert all field definitions
  for (const field of editableFieldDefinitions) {
    await db.insert(communityEditableFields).values({
      entityType: field.entityType,
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      isCritical: field.isCritical,
      displayName: field.displayName,
      validationRules: field.validationRules || null,
    });
  }

  console.log(`   Inserted ${editableFieldDefinitions.length} field definitions`);
  console.log("✅ Seed complete");
}

seedEditableFields()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  });
