# Captured record

Follow the [version rule](CONTEXT.md#version-rule).

The record capture hands to archive. The archive uses the source ID to refuse repeat imports and saves the payload byte for byte.

Version 1:

| Field | Meaning |
| --- | --- |
| `record_version` | 1 |
| `source_id` | 1 to 2,048 characters of valid text |
| `payload` | The exact original bytes |
| `source_kind` | `mail`, `text`, `call` or `import` |
| `media_type` | File type, such as `message/rfc822` for email |
| `captured_at` | When capture received it |

A source ID is exact text: capitals, spaces and every other character count, and nothing is trimmed or folded. It is unique across the whole archive, not only within one kind of capture.

In TypeScript, the payload is a `Uint8Array`. The code form and reader are in [captured-record.ts](captured-record.ts).
