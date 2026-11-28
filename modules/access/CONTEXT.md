---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#agent"]
produces: ["Caller and level"]
---
# access — Who is calling

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes sign-in to this install.

One job: say who is calling, and at what level.

## What it owns

Sign-ins to this install, and the list of agents. Two kinds of sign-in: the person's, and one token per agent. The person creates a token and can switch it off. A token is shown once and then kept only as a fingerprint.

How the person signs in on a phone is still open; a passkey is proposed.

## What it never does

It never holds a Google sign-in. It never calls a model. It never starts or wakes an agent.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `whoami` | Who the caller is, and its level | Read | `you`, `agent` |
| `agent_create` | Make an agent sign-in. The token is shown once | You | `created`, `name_taken` |
| `agent_list` | Agents, their levels, on or off, and last used | You | `listed` |
| `agent_set` | Change an agent's level, or switch it off or on | You | `changed`, `unknown_agent` |
| `device_list` | The person's signed-in devices | You | `listed` |
| `device_remove` | Remove one signed-in device | You | `removed`, `last_device` |

An agent that is switched off is refused at once, as `switched_off` from the [door](../operations/CONTEXT.md). Levels are on the [agent](../../contracts/CONTEXT.md#agent) shape. `prepare` is the highest an agent can hold.

## Hard rules

1. A token is shown once. What is stored is a fingerprint, not the token.
2. This part never holds a Google sign-in. That stays in connections.
3. Switching an agent off refuses its next call. It does not erase matters.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Agent](../../contracts/CONTEXT.md#agent)

## Process

1. On each call, resolve the person or the agent token to a level.
2. Return one named result.

## Outputs

- Caller and level

## Check

When this part's code is written, a contributor creates an agent, sees the token once, and a later read does not return the token. An agent that is switched off is refused on the next call.
