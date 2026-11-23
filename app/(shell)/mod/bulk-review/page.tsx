import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/ContentPage";
import { getCurrentUser } from "@/lib/auth";
import { getWebsiteBatch, readReceipt } from "@/lib/mod/review-website-corrections";
import { reviewBatch } from "./actions";
import { ReviewButton } from "./review-button";

export const dynamic = "force-dynamic";

export default async function BulkReviewPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !["admin", "moderator"].includes(user.role)) notFound();
  const batch = getWebsiteBatch();
  const receipt = await readReceipt(batch.id);
  const { changed } = await searchParams;
  const report = receipt?.report;
  const skipped = new Map([
    ...(report?.skips.map((r) => [r.entityId, r.reason] as const) ?? []),
    ...(report?.deferrals.map((r) => [r.entityId, "Website field locked"] as const) ?? []),
  ]);
  return (
    <ContentPage>
      <ContentPage.Header
        title="Bulk Review"
        breadcrumbs={[{ label: "Moderation", href: "/mod" }, { label: "Bulk Review" }]}
      />
      <ContentPage.Body>
        <section className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6" aria-label={batch.title}>
          <h2 className="text-xl font-semibold">{batch.title}</h2>
          <p>
            {receipt ? (receipt.decision === "approve" ? "Approved" : "Rejected") : "Awaiting review"} ·{" "}
            {batch.rows.length} proposals
          </p>
          <p>
            Approval applies only the changes below where the old value still matches and the utility and field are not
            locked.
          </p>
          {changed && <p role="alert">The diff changed. Review the current proposal before deciding.</p>}
          {report && (
            <section aria-label="Publication receipt">
              <p>
                {report.updated} applied · {report.unchanged - report.deferrals.length} already current · {skipped.size}{" "}
                skipped
              </p>
              {report.updated > 0 && (
                <Link className="underline" href={`/api/v1/changelog/batches/${report.batchId}`}>
                  View published changelog batch
                </Link>
              )}
            </section>
          )}
          <ol className="divide-y divide-current/20">
            {batch.rows.map((row) => (
              <li key={row.utilityId} className="space-y-2 py-3">
                <h3 className="font-semibold">
                  <Link className="underline" href={`/explore/utilities/${row.slug}`}>
                    {row.utility}
                  </Link>
                </h3>
                <dl className="grid gap-1 break-all text-sm sm:grid-cols-[7rem_1fr]">
                  <dt>Old website</dt>
                  <dd>{row.oldValue}</dd>
                  <dt>New website</dt>
                  <dd>{row.newValue}</dd>
                  <dt>Source</dt>
                  <dd>
                    <a className="underline" href={row.sourceUrl}>
                      {row.sourceUrl}
                    </a>{" "}
                    · {row.checkedOn}
                  </dd>
                </dl>
                <p className="text-sm">{row.evidence}</p>
                {skipped.has(row.utilityId) && <p>Skipped: {skipped.get(row.utilityId)}</p>}
              </li>
            ))}
          </ol>
          {!receipt && (
            <form action={reviewBatch} className="flex flex-wrap gap-2">
              <input type="hidden" name="digest" value={batch.digest} />
              <ReviewButton decision="approve">Approve and apply {batch.rows.length} proposals</ReviewButton>
              <ReviewButton decision="reject">Reject batch</ReviewButton>
            </form>
          )}
        </section>
      </ContentPage.Body>
    </ContentPage>
  );
}
