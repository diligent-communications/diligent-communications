# Action receipt

Follow the [version rule](CONTEXT.md#version-rule).

A readable record that identifies an approved action, its outcome, and any confirmation needed to recognize it after restore or retry. The archive saves an action receipt only for an approved action. It is not the command receipt a write returns.

Version 1 (minimum): `receipt_version`, `receipt_id`, `action_id`, `approval_id` (the approval's `decision_id`), `outcome` (`succeeded`, `failed` or `unknown`), `confirmation`, and `recorded_at`.
