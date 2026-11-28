---
build_step: 1
status: draft
consumes: ["../operations/CONTEXT.md","../store/CONTEXT.md","../../contracts/CONTEXT.md#agent","../../contracts/CONTEXT.md#who-did-it"]
produces: ["Caller and level"]
---
# access — Who is calling

Draft. The seam below is what other parts may rely on. The inner behaviour is written with this part's code. Piece 1 completes sign-in to this install.

One job: say who is calling, and at what level.

## What it owns

Sign-ins to this install, and the list of agents. The command line stays signed in as the person, once per device, like the screens. It never keeps the password. It keeps its session on that PC, and the install keeps only a hash of it. Every sign-in is kept only as a hash. That covers the password, agent tokens, the person's sessions and device sign-ins. Wrong tries are locked out. A passkey can be added later. It is not this sign-in. The person creates an agent token and can switch it off. The command line's bridge holds an agent token the person made for it. This part never treats that token as the person's password.

Any program that can run commands on that PC, an agent included, can act through a signed-in command line at the person's level. The Prepare level and the person's tap limit an agent that uses its own sign-in; they do not limit a program on the same PC as a signed-in command line, and nothing says the bridge rule does.

A caller kind `device` is named for the phone app. Its sign-in is defined in piece three. Until then this seam only names it. A change it makes is recorded as `device:<id>` in [Who did it](../../contracts/CONTEXT.md#who-did-it).

## What it never does

It never holds a Google sign-in. It never calls a model. It never starts or wakes an agent.

## Operations

| Operation | Meaning | Level | Named results |
| --- | --- | --- | --- |
| `whoami` | Who the caller is, and its level | Read | `you`, `agent` |
| `agent_create` | Make an agent sign-in. The token is in the first `created` answer only | You | `created`, `name_taken` |
| `agent_list` | Agents, their levels, on or off, and last used | You | `listed` |
| `agent_set` | Change an agent's level, or switch it off or on | You | `changed`, `unknown_agent` |
| `device_list` | The person's signed-in devices | You | `listed` |
| `device_remove` | Remove one signed-in device | You | `removed`, `last_device` |

An agent that is switched off is refused at once, as `switched_off` from the [door](../operations/CONTEXT.md). Levels are on the [agent](../../contracts/CONTEXT.md#agent) shape. `prepare` is the highest an agent can hold.

## Hard rules

1. `agent_create` returns the token in its first `created` answer only. No kept answer, row, backup, activity line or log holds it. The install keeps a hash. A repeat of the same request returns `created` without the token. A lost token is replaced by making a new one.
2. Every sign-in is kept only as a hash. That covers the password, agent tokens, the person's sessions and device sign-ins. Wrong tries are locked out. The password is typed once per device.
3. This part never holds a Google sign-in. That stays in connections.
4. Switching an agent off refuses its next call. It does not erase matters.

## Inputs

- Working: None yet.
- Reference: [Operations](../operations/CONTEXT.md)
- Reference: [Store](../store/CONTEXT.md)
- Reference: [Agent](../../contracts/CONTEXT.md#agent)
- Reference: [Who did it](../../contracts/CONTEXT.md#who-did-it)

## Process

1. On each call, resolve the person or the agent token to a level.
2. Return one named result.

## Outputs

- Caller and level

## Check

When this part's code is written, a contributor creates an agent and sees the token in the first `created` answer only. A repeat returns `created` without the token. A later read does not return the token or the password, only a check against the hash. Wrong tries lock out. An agent that is switched off is refused on the next call.
