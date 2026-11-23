# Utility website corrections — November 2026

The [reviewed proposal](../../data/utility-website-corrections/2026-11.json) contains 132 researched website corrections. Four candidates already changed and 62 lacked sourced replacements; neither group is included. Each proposal cites the utility or jurisdiction and observation date. This batch does not edit registry domains, seed data, or scheduled syncs.

Merging makes the proposal available under **Moderation → Bulk Review**; it does not publish anything. A moderator can approve or reject the exact displayed diff. Approval uses the same `applySync` writer as URDB. The decision, eligible writes and their field-level changelog entries commit together. At apply time, the writer locks each row and skips missing, retired, changed, or locked records. Repeated decisions do not reapply. The receipt links to the changelog batch, and each utility's public version history carries the old and new website.

This first version accepts one curated, checked-in batch. It does not add arbitrary uploads, per-row decisions, or review of scheduled feeds. A corrected or compensating proposal needs a new review ID and old-value preconditions based on the current registry.
