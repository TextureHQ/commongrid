# Utility logo storage

Implementation tracker: https://linear.app/texture/issue/CG-323/build-utility-logo-uploads-cropping-and-moderated-contributions

This branch is an incremental implementation, not a deployed upload feature.
The first migration registers `utility.logo` for mandatory human review without
re-seeding or replacing other editable fields. Existing logo values and static
files are unchanged.

Remaining implementation: authenticated image uploads, server-validated crops,
private S3-compatible storage retaining originals, contributor UI, moderator
previews, and dry-run/apply/rollback tooling for existing repository logos.
Storage must be configured through Terraform; no production migration is run
from a developer workstation. Keep static files until migrated URLs are verified.
