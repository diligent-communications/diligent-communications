---
consumes: []
produces: []
---
# contracts — Shapes parts share

`record-fields.ts` is four checks a record can be given: is it a record, has it exactly these fields, is it text, and is it a UTC time.

## Version rule

Each shape that has a version number has its own whole number, starting at 1. Any change to its fields raises it. A reader accepts the versions it knows and refuses a newer one with a clear message, without rewriting it. All times are UTC.

A shared shape is added here by the piece whose code first uses it, first and alone.

## Shapes

None of these shapes is stored with a version number yet. Each heading names the file that holds the shape and its check.

### Level

`who.ts`. `read`, `prepare` or `you`. Each level includes the ones before it. An agent holds `read` or `prepare`, never `you`.

### Who did it

`who.ts`. The name a change is recorded under: `you` for the person, `diligent` for the install acting by itself, `agent:<id>` or `device:<id>`. An ID is lowercase letters and digits.

### Caller

`who.ts`. The caller of one request, as access identified it. It is one of:

- `nobody`: a caller with no sign-in.
- `you`: the person, with the ID of the session row. The ID is not the session.
- `agent`: an agent's `id`, `name`, `level`, and whether it is `on`.

A caller kind `device` is named in the [target map](../map/target.md#the-parts) and is added here in piece three.

### Agent

`agent.ts`. `id`, `name`, `level` (`read` or `prepare`), `on` (true or false), `made_at`, and `last_used_at`, which is empty until the agent's first call. It has no field for the token.

### Activity line

`activity.ts`. `at` (a UTC time), `who` (who did it), `operation`, `on` (a kind and an ID such as `agent:4f2a`, or nothing) and `result` (the result's name). It has no field that could hold message content or a secret.

### Answer

`operation.ts`. What an operation answers: `result`, the result's name, `description`, a plain sentence that names what the result is about, and the fields that result carries. `ANY_OPERATION_RESULTS` lists the results any operation can return, each with its meaning.

### Operation

`operation.ts`. One entry in the operations list:

- `name`, in lowercase and underscores, the `part` that owns it, and its `meaning`.
- `level`: `read`, `prepare`, `you`, or `none`. `none` means it needs no session, and it is the person's: an agent sign-in is answered `not_allowed`.
- `changes`: true when it changes something. A read is false.
- `request_id`: true when it takes a request ID and its answer is kept. Only an operation that changes something may.
- `input`: each input's kind (`text`, `choice`, `yes_no` or `count`), its limits, whether it is required, and whether it is `secret`. A secret is a sign-in the person types.
- `results`: its own named results, each with its meaning.
- `shown_once`: answer fields left out of the kept answer and of a repeat.

`checkInput` accepts an input only when it is exactly what the operation takes. A refusal names the field and the rule and never repeats the value.

### Work

`operation.ts`. What a part's work hands the door for one call: the `answer`; `on`, what was changed; `writes`, the database changes that must land together; `as`, who the call is recorded under when the call itself proved the person or the install acted by itself; and `session`, a session to begin or end on the calling device, which travels beside the answer and is never in it.

A write is one SQL statement and its values. Only [store](../modules/store/CONTEXT.md) runs one.
