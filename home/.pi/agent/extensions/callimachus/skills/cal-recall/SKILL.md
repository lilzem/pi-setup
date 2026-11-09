---
name: cal-recall
description: Search past coding-agent sessions (pi, Claude Code, Cursor) with the local `cal` CLI. Use before planning unfamiliar work ("have we done this before?"), when the user asks what was decided or how something was fixed earlier, when an error looks familiar, or before reversing a design decision.
---

# cal-recall

`cal` reads a local index of past sessions. In its output the source `codex` means **pi**; `claude_code` and `cursor` are the other agents. Keep output small: always pass `-n`.

| Need | Command |
|---|---|
| Prior work on a task | `cal similar "<task>" -n 5` |
| Find a topic | `cal search "<terms>" -y -n 5` (drop `-y` if it reports no embeddings) |
| Scope to the repo | add `-p "$PWD"` |
| Read a hit | `cal cat <id>` — pipe through `head -c 8000`; threads are long |
| Settled decisions vs a proposal | `cal check "<proposal>"` |
| Decisions / gotchas | `cal decisions "<topic>" -n 5`, `cal gotchas "<topic>" -n 5` |
| Recurring errors | `cal issues "$PWD" -n 10` |
| Who touched a file | `cal files <path>`, `cal why <file>:<line>` |
| Record a decision | `cal remember decision "<text>" --because "<why>"` (only when the user settles something) |

Rules:
- Treat results as leads, not truth: verify against the current code before relying on them.
- Cite the thread id when an answer comes from history.
- Never run `cal ask` or `cal distill` (they send transcripts to an LLM) unless the user asks.
