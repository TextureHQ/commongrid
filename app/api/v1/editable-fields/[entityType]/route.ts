import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { communityEditableFields } from "@/lib/db/schema/community-editable-fields";
import { reportError } from "@/lib/observability";

/**
 * GET /api/v1/editable-fields/[entityType]
 *
 * Returns editable field definitions for the specified entity type.
 * Used by EditEntityPanel to render the appropriate form fields.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ entityType: string }> }) {
  const { entityType } = await params;

  // Validate entity type
  const validEntityTypes = ["utility", "power_plant", "ev_station", "pricing_node", "program"];

  if (!validEntityTypes.includes(entityType)) {
    return NextResponse.json({ error: `Invalid entity type: ${entityType}` }, { status: 400 });
  }

  try {
    const db = getDb();
    const fields = await db
      .select({
        fieldName: communityEditableFields.fieldName,
        fieldType: communityEditableFields.fieldType,
        isCritical: communityEditableFields.isCritical,
        displayName: communityEditableFields.displayName,
        validationRules: communityEditableFields.validationRules,
      })
      .from(communityEditableFields)
      .where(eq(communityEditableFields.entityType, entityType));

    return NextResponse.json({ data: fields });
  } catch (error) {
    reportError(error, { scope: "api.editable-fields" });
    return NextResponse.json({ error: "Failed to fetch editable fields" }, { status: 500 });
  }
}
