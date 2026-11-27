# Saved decision

Follow the [version rule](CONTEXT.md#version-rule).

A readable record of a person's choice, such as a review, contact merge or reversal, or approval. It identifies the choice and the item or action it applies to so state can rebuild it after restore.

Version 1 (minimum): `decision_version`, `decision_id`, `kind` (for example `approval` or `review`), `applies_to` (type and ID), `decided_at`, and optional `details`.
