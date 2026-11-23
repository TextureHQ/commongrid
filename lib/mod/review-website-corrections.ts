import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import input from "@/data/utility-website-corrections/2026-11.json";
import { getPooledDb } from "@/lib/db/client-pooled";
import { bulkOperations } from "@/lib/db/schema";
import { type ApplySyncReport, applySync } from "@/lib/sync/apply-sync";

const https = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && /\.[a-z]{2,}$/i.test(url.hostname) && !url.username && !url.password && !url.port;
});
export function parseWebsiteDiff(input: unknown) {
  const rows = z
    .array(
      z.strictObject({
        utilityId: z.uuid(),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        utility: z.string().min(1),
        field: z.literal("website"),
        oldValue: z.string().regex(/^https?:\/\//),
        newValue: https,
        sourceUrl: https,
        checkedOn: z.iso.date(),
        evidence: z.string().min(1),
      })
    )
    .min(1)
    .max(500)
    .parse(input);
  if (
    new Set(rows.map((r) => r.utilityId)).size !== rows.length ||
    new Set(rows.map((r) => r.slug)).size !== rows.length ||
    rows.some((r) => r.newValue === r.oldValue)
  )
    throw new Error("Repeated or unchanged proposal");
  return rows;
}
export function getWebsiteBatch() {
  const rows = parseWebsiteDiff(input);
  return {
    id: "review:utility-websites:2026-11",
    title: "Utility website corrections — November 2026",
    rows,
    digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  };
}
type Receipt = { reviewerId: string; digest: string; decision: "approve" | "reject"; report: ApplySyncReport | null };
export async function readReceipt(id: string) {
  const [row] = await getPooledDb().select().from(bulkOperations).where(eq(bulkOperations.idempotencyKey, id));
  return row?.result as Receipt | undefined;
}
/** Only the role-checked moderation action calls this writer. */
export async function decideWebsiteBatch(reviewerId: string, digest: string, decision: Receipt["decision"]) {
  const batch = getWebsiteBatch();
  if (digest !== batch.digest) return "stale" as const;
  return getPooledDb().transaction(async (tx) => {
    // A unique claim serializes decisions. The receipt and all changes commit or roll back together.
    const [claim] = await tx
      .insert(bulkOperations)
      .values({ idempotencyKey: batch.id })
      .onConflictDoNothing()
      .returning({ id: bulkOperations.idempotencyKey });
    if (!claim) return "already_reviewed" as const;
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    const ref = sha && /^[a-f0-9]{40}$/.test(sha) ? sha : "main";
    const report =
      decision === "approve"
        ? await applySync(
            [...batch.rows]
              .sort((a, b) => a.utilityId.localeCompare(b.utilityId))
              .map((r) => ({
                entityId: r.utilityId,
                sourceId: "manual",
                asOf: null,
                fields: { website: r.newValue },
                expectedCurrent: { website: r.oldValue, slug: r.slug },
              })),
            {
              tx,
              entityType: "utility",
              initiatedBy: "sync:utility-website-corrections",
              batchTitle: batch.title,
              batchDescription: `Reviewed sources: https://github.com/TextureHQ/commongrid/blob/${ref}/data/utility-website-corrections/2026-11.json (SHA-256: ${batch.digest})`,
            }
          )
        : null;
    const receipt = { reviewerId, digest, decision, report } satisfies Receipt;
    await tx
      .update(bulkOperations)
      .set({ status: "completed", completedAt: new Date(), result: receipt })
      .where(eq(bulkOperations.idempotencyKey, batch.id));
    return "reviewed" as const;
  });
}
