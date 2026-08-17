/**
 * Re-apply a contribution that was accepted but never written.
 *
 * Before the auto-approve fix, a contribution could have its status flipped to
 * `auto_approved` while the entity write failed, leaving `applied_version`
 * null: accepted on paper, absent from the data, and absent from history.
 *
 * Replays through `applyContribution` — the same path a moderator approval
 * takes — rather than hand-written SQL, so the result is by construction what a
 * normal approval produces: entity updated, version written, contribution
 * marked, contributor credited, all in one transaction.
 *
 * That also settles the stale-`old` problem. A dropped contribution's recorded
 * `old` can be months out of date; `applyContribution` computes the delta from
 * the entity's actual state, so the history records what really changed rather
 * than what the submission claimed.
 *
 *   npm run db:replay-contribution -- <id>            # dry run
 *   npm run db:replay-contribution -- <id> --apply
 */

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { contributions, users } from "@/lib/db/schema";
import {
  type ApplicableContribution,
  applyContribution,
  type ChangeType,
  markContributionApplied,
} from "@/lib/mod/apply-contribution";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const id = args.find((a) => !a.startsWith("--"));

  if (!id) {
    console.error("Usage: npm run db:replay-contribution -- <contribution-id> [--apply]");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const db = drizzle(client);

  try {
    const [row] = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);
    if (!row) {
      console.error(`Contribution ${id} not found.`);
      process.exit(1);
    }

    console.log(`contribution : ${row.id}`);
    console.log(`entity       : ${row.entityType} ${row.entityId}`);
    console.log(`status       : ${row.status}`);
    console.log(`applied      : ${row.appliedVersion ?? "never"}`);
    console.log(`changes      : ${JSON.stringify(row.changes)}`);
    console.log(`mode         : ${apply ? "APPLY" : "dry run"}\n`);

    // Only ever touch a contribution that was accepted and never written.
    // Re-applying an already-applied one would double-bump the version and
    // record a second, empty delta.
    if (row.appliedVersion !== null) {
      console.error(`Refusing: already applied at version ${row.appliedVersion}.`);
      process.exit(1);
    }
    if (row.status !== "approved" && row.status !== "auto_approved") {
      console.error(`Refusing: status is '${row.status}', not an accepted contribution.`);
      process.exit(1);
    }

    if (!apply) {
      console.log("Dry run. Re-run with --apply to write.");
      return;
    }

    const applicable: ApplicableContribution = {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      entitySlug: row.entitySlug,
      entityVersion: row.entityVersion ?? 1,
      changes: row.changes,
      editSummary: row.editSummary ?? "",
      changeType: row.changeType,
      userId: row.userId,
    };

    const outcome = await db.transaction(async (tx) => {
      const result = await applyContribution(tx, applicable, {
        actorId: row.reviewedBy ?? "system",
        sourceType: "community",
        changeType: (row.changeType as ChangeType) ?? "update",
      });

      if (result.status !== "applied") {
        // Throwing rolls the transaction back — a partial replay is worse than
        // none, and the reason is worth surfacing rather than swallowing.
        throw new Error(`applyContribution returned '${result.status}': ${JSON.stringify(result)}`);
      }

      await markContributionApplied(tx, row.id, {
        status: row.status === "auto_approved" ? "auto_approved" : "approved",
        appliedVersion: result.appliedVersion,
        reviewedBy: row.reviewedBy ?? null,
        moderatorComment: "Re-applied: originally accepted but never written.",
        autoApproved: row.status === "auto_approved",
      });

      // The interrupted auto-approve would have credited the contributor after
      // writing the entity. Replaying without this leaves someone with an
      // approved contribution and a zeroed count.
      if (row.userId) {
        await tx
          .update(users)
          .set({ approvedCount: sql`${users.approvedCount} + 1`, updatedAt: new Date() })
          .where(eq(users.id, row.userId));
      }

      return result;
    });

    console.log(`Applied at version ${outcome.appliedVersion} (${outcome.changeType}).`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
