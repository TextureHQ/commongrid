# Utility website corrections — November 2026 (Batch 2)

The [reviewed proposal](../../data/utility-website-corrections/2026-11-batch-2.json) contains 66 researched website corrections completing the remaining utility URL corruption audit. Each proposal cites the utility or jurisdiction, authoritative source URL, and observation date.

Merging makes the proposal available under **Moderation → Bulk Review**; it does not publish anything. A moderator can approve or reject the exact displayed diff. Approval uses the same `applySync` writer as URDB. The decision, eligible writes and their field-level changelog entries commit together. At apply time, the writer locks each row and skips missing, retired, changed, or locked records. Repeated decisions do not reapply. The receipt links to the changelog batch, and each utility's public version history carries the old and new website.
