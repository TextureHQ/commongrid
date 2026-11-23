"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModerator } from "@/lib/mod/require-moderator";
import { decideWebsiteBatch } from "@/lib/mod/review-website-corrections";

export async function reviewBatch(form: FormData) {
  const reviewer = await requireModerator();
  const digest = form.get("digest");
  const decision = form.get("decision");
  if (typeof digest !== "string" || (decision !== "approve" && decision !== "reject"))
    throw new Error("Invalid review decision");
  const outcome = await decideWebsiteBatch(reviewer.id, digest, decision);
  if (outcome === "reviewed" && decision === "approve") revalidatePath("/changelog");
  redirect(outcome === "stale" ? "/mod/bulk-review?changed=1" : "/mod/bulk-review");
}
