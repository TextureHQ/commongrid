# Utility logo storage

Implementation tracker: https://linear.app/texture/issue/CG-323/build-utility-logo-uploads-cropping-and-moderated-contributions

The first migration registers `utility.logo` for mandatory human review without
re-seeding or replacing other editable fields. Existing logo values and static
files are unchanged. This is not yet a deployed upload feature.

## Incremental delivery

Each slice gets its own reviewable PR; no slice waits for the whole feature:

1. **Read-only repository inventory** (this slice): checksums, references, and gaps.
2. **Private storage**: verify provider availability, define infrastructure and
   environment bindings in Terraform, add a configurable S3-compatible adapter.
3. **Validated uploads**: authenticated API, byte/dimension limits, image decoding,
   stripped metadata, original retention, crop renditions, attribution/usage notes.
4. **Contribution UI and visual moderation**: crop editor and side-by-side review;
   trusted contributors still require human approval for logo changes.
5. **Reviewed migration**: dry-run/apply/rollback job using inventory plus current
   database values. Keep existing static files until approved URLs are verified.

No infrastructure is provisioned by this inventory. Storage and production data
mutations must ship through reviewed infrastructure/jobs, not workstation writes.

## Read-only legacy inventory

From a checkout with dependencies installed:

```sh
npx tsx scripts/inventory-logos.ts > /tmp/commongrid-logo-inventory.json
```

The CLI emits deterministic JSON to stdout; shell redirection writes the report
outside the repository. It has **no apply mode**, accepts no flags, performs no
network calls, and does not connect to the database or storage. Unknown arguments
fail rather than pretending an apply/dry-run action occurred. Invalid datasets,
duplicate IDs, missing input directories, and symlinks fail closed.

Inputs are `data/utilities.json`, `data/isos.json`, `data/rtos.json`,
`data/balancing-authorities.json`, and all regular files beneath `public/logos/`.
All four datasets matter: an asset unused by utilities may still belong to a grid
operator. This is **repository-only**, not an audit of current production values.

The versioned report contains:

- `inputs`: SHA-256 of each exact dataset file, so changed inputs can be detected.
- `references`: entity type, ID, slug, unchanged `currentLogo`, and classification
  (`absent`, `local`, `missing`, `external`, or `unsupported`). Empty strings and
  null are absent; only literal safe `/logos/...` paths resolve locally. HTTP(S)
  values are recorded, never fetched. Other values require manual investigation.
- `assets`: repository/public paths, byte size, SHA-256 of original bytes, and all
  matching references. This is not MIME validation or a claim that bytes decode
  into a safe image. No conversion, crop, or upload occurs.
- `duplicateContent`: distinct file paths containing identical bytes. Identical
  content does not establish that the logo is correct for either entity.
- `summary`: counts of reference states, shared/unreferenced assets, and duplicate
  content groups. “Unreferenced” means only unreferenced by these four snapshots;
  **it is not permission to delete a file**.

Upstream acquisition URLs and usage rights are not recorded in these datasets.
Every asset therefore has `sourceUrl: null`, `usageNote: null`, and
`provenanceStatus: "needs-review"`. A utility website is not substituted for an
actual acquisition source, nor does the project's data license establish rights
to a trademark. Repository paths and hashes establish only which bytes we have.

## Migration safeguards for the next slices

Before applying any migration, compare the manifest with current database values
and regenerate if its inputs changed. Never overwrite a newly approved community
logo. Retain original bytes, record each previous value for rollback, validate the
newly served rendition, and preserve the static fallback. Brand corrections,
including holding-company logos, must follow the same reviewed contribution path
as other changes; a bulk copy is not evidence of brand correctness.
