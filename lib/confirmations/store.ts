/**
 * Reading a utility's confirmable fields and saving confirmations.
 *
 * Writes only to record_confirmations. Never touches the utility or program
 * rows, entity_versions, or field_moderation_state.
 */

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { programs, recordConfirmations, utilities } from "@/lib/db/schema";
import {
  buildRows,
  type ConfirmRequestField,
  type ConfirmRow,
  checkAgainstRows,
  confirmerName,
  rowKey,
} from "./record";

export interface LoadedRecord {
  utility: {
    id: string;
    slug: string;
    name: string;
    /** Shown in "Confirmed by …". */
    confirmerName: string;
    website: string | null;
    domains: string[] | null;
  };
  rows: ConfirmRow[];
}

export async function loadRecord(slug: string): Promise<LoadedRecord | null> {
  const db = getDb();
  const [u] = await db
    .select({
      id: utilities.id,
      slug: utilities.slug,
      name: utilities.name,
      shortName: utilities.shortName,
      segment: utilities.segment,
      website: utilities.website,
      domains: utilities.domains,
      generationProviderId: utilities.generationProviderId,
    })
    .from(utilities)
    .where(and(eq(utilities.slug, slug), isNull(utilities.deletedAt)))
    .limit(1);
  if (!u) return null;

  const [supplierRows, programRows, confirmationRows] = await Promise.all([
    u.generationProviderId
      ? db
          .select({ id: utilities.id, name: utilities.name })
          .from(utilities)
          .where(eq(utilities.id, u.generationProviderId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ id: programs.id, slug: programs.slug, name: programs.name, status: programs.status })
      .from(programs)
      .where(
        and(
          isNull(programs.deletedAt),
          sql`${programs.organizations} @> ${JSON.stringify([{ entityId: u.slug }])}::jsonb`
        )
      ),
    db
      .select({
        entityType: recordConfirmations.entityType,
        entityId: recordConfirmations.entityId,
        fieldName: recordConfirmations.fieldName,
        confirmedValue: recordConfirmations.confirmedValue,
        createdAt: recordConfirmations.createdAt,
      })
      .from(recordConfirmations)
      .where(eq(recordConfirmations.utilityId, u.id)),
  ]);

  return {
    utility: {
      id: u.id,
      slug: u.slug,
      name: u.name,
      confirmerName: confirmerName(u),
      website: u.website,
      domains: u.domains,
    },
    rows: buildRows({
      utility: u,
      supplier: supplierRows[0] ?? null,
      programs: programRows,
      confirmations: confirmationRows,
    }),
  };
}

/** A repeat confirmation of the same value by the same person within this window adds nothing. */
const REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type SaveOutcome =
  | { kind: "saved"; saved: number; confirmedAt: string }
  | { kind: "rejected"; unknown: string[]; stale: string[] };

export async function saveConfirmations(
  record: LoadedRecord,
  fields: ConfirmRequestField[],
  confirmer: { userId: string; emailDomain: string },
  now = new Date()
): Promise<SaveOutcome> {
  const checked = checkAgainstRows(fields, record.rows);
  if (!checked.ok) return { kind: "rejected", unknown: checked.unknown, stale: checked.stale };

  const db = getDb();
  const recent = await db
    .select({
      entityType: recordConfirmations.entityType,
      entityId: recordConfirmations.entityId,
      fieldName: recordConfirmations.fieldName,
      confirmedValue: recordConfirmations.confirmedValue,
    })
    .from(recordConfirmations)
    .where(
      and(
        eq(recordConfirmations.utilityId, record.utility.id),
        eq(recordConfirmations.userId, confirmer.userId),
        gt(recordConfirmations.createdAt, new Date(now.getTime() - REPEAT_WINDOW_MS))
      )
    );
  const repeats = new Set(
    recent.map((r) => `${rowKey(r.entityType, r.entityId, r.fieldName)}=${JSON.stringify(r.confirmedValue)}`)
  );

  const submissionId = crypto.randomUUID();
  const values = checked.rows
    .filter((r) => !repeats.has(`${r.key}=${JSON.stringify(r.value)}`))
    .map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      utilityId: record.utility.id,
      fieldName: r.fieldName,
      confirmedValue: r.value,
      userId: confirmer.userId,
      emailDomain: confirmer.emailDomain,
      submissionId,
      createdAt: now,
    }));

  if (values.length > 0) await db.insert(recordConfirmations).values(values);
  return { kind: "saved", saved: values.length, confirmedAt: now.toISOString() };
}
