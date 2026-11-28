---
consumes: []
produces: []
---
# contracts — Shapes parts share

`record-fields.ts` is four checks a record can be given: is it a record, has it exactly these fields, is it text, and is it a UTC time.

## Version rule

Each shape that has a version number has its own whole number, starting at 1. Any change to its fields raises it. A reader accepts the versions it knows and refuses a newer one with a clear message, without rewriting it. All times are UTC.

A shared shape is added here by the piece whose code first uses it, first and alone.
