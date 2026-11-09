# Callimachus (`cal`) guide

Local, searchable index of every coding-agent session on this machine: **pi**, **Claude Code** and **Cursor**. Nothing leaves the machine.

pi sessions are mirrored into Codex format, so in `cal` output **`codex` means pi**. Filter with `-s codex`, `-s claude_code` or `-s cursor`.

Topics: `/cal-help search` · `/cal-help memory` · `/cal-help code` · `/cal-help insights` · `/cal-help maintenance` · `/cal-help pi`

`/cal-help` works inside pi; in a regular terminal use `cal-help [topic]` (no slash).

## search

| Command | What it does |
|---|---|
| `cal search "query"` | keyword search, one hit per thread with a snippet |
| `cal search "query" -y` | hybrid: keyword + semantic (needs `cal embed`) |
| `cal search "query" -s codex -n 5` | only pi sessions, top 5 |
| `cal recent -p ~/dev/funnel-builder` | latest sessions in a project |
| `cal similar "add stripe webhooks"` | "have I done this before?" — prior sessions like this task |
| `cal related "text"` | threads related to a passage |
| `cal cat <thread-id>` | print a thread (id is the `[NNN]` in search output) |
| `cal ask "how did we set up releases?"` | cited answer from history (sends snippets to an LLM; needs an engine) |

Add `--json` to any of these for scripting.

## memory

| Command | What it does |
|---|---|
| `cal remember decision "use pnpm" --because "workspaces"` | record a settled decision |
| `cal remember gotcha "vitest needs --pool=forks here"` | record a gotcha |
| `cal check "switch to npm"` | surfaces settled decisions that contradict a proposal |
| `cal decisions "auth"` / `cal gotchas "build"` | search recorded facts |
| `cal memory [project]` | a project's decisions, gotchas and open TODOs |
| `cal todos` / `cal done <id>` | TODOs extracted from sessions |
| `cal star <id>` / `cal tag <id> tag1 tag2` | bookmark threads |

## code

| Command | What it does |
|---|---|
| `cal files src/auth.ts` | every thread that mentioned a file |
| `cal why src/auth.ts:42` | sessions behind a line |
| `cal commits [repo]` | which commits each thread produced (inferred from git) |

## insights

| Command | What it does |
|---|---|
| `cal issues [project]` | errors you keep hitting (last 180 days) — fix the pattern |
| `cal stats` | sessions per agent, projects, embed coverage |
| `cal report --since 7` | weekly summary |
| `cal cost --by project` | estimated spend (Claude Code/Codex usage only) |

## maintenance

| Command | What it does |
|---|---|
| `/cal-sync` (in pi) | mirror pi sessions, then reindex everything now |
| `cal index` | reindex all agents (unchanged files are skipped) |
| `cal embed` | embed new messages for `-y` semantic search |
| `cal version` / `cal help` | version / full command reference |

pi syncs automatically when a pi session ends (mirror + `cal index --if-stale`).

Files:
- binary: `~/.local/share/callimachus-cli/` → `~/.local/bin/cal`
- index: `~/Library/Application Support/dev.shaller.callimachus/index.db`
- pi mirror: `~/.local/share/callimachus-pi/` (set as `paths.codex_home` in the index)
- extension: `~/.pi/agent/extensions/callimachus/`

Upgrade: download the new `cal-aarch64-apple-darwin` from the GitHub releases of BetaBots-LLC/callimachus, verify against `SHA256SUMS`, replace the binary.

## pi

Inside pi the agent has the `cal-recall` skill: it runs `cal similar` / `cal search` before planning unfamiliar work and `cal check` before reversing a design decision. Ask it things like "have we solved this before?" or "what did we decide about X?".

The contrarian subagent also runs `cal similar` and `cal check` when challenging a plan.
