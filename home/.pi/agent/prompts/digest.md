---
description: Apply today's Pi / Claude Code digest email to the pi setup, update everything, sync ~/pi-setup
argument-hint: "[date, e.g. 'Nov 11' — defaults to today]"
---
Apply the Pi / Claude Code digest to my pi setup. Target digest: ${@:-today's (the newest one)}.

## 1. Read the digest
- If the `mcp_gmail_*` tools are missing, call `mcp_connect` with name `gmail` first.
- `mcp_gmail_search_emails` with query `from:me to:me subject:"Pi / Claude Code digest"`, pick the target digest, then `mcp_gmail_read_email`. If the body comes back indexed, pull every chunk with `ctx_search` (source from the hint) until you have all numbered items and the "Skipped" paragraph.
- If no digest exists for the target date, say so and stop.

## 2. Know the current setup
Inspect before judging, so nothing already installed is re-added:
- `~/.pi/agent/settings.json` (packages, skills), `pi list`
- `~/.pi/agent/extensions`, `~/.pi/agent/prompts`, `~/.pi/agent/agents`, `~/.pi/agent/mcp.json`
- `~/.claude/skills`, `~/AGENTS.md`

## 3. Choose
For each digest item, judge: real improvement for my workflow, not overlapping what I have, safe (license, no third-party hosting of my code, no secrets leaving the machine), and effort. Then call `ask_user_question` once with a multiSelect listing every item as an option, the recommended ones first and marked "(Recommended)", each description stating the concrete action (install command, or the extension/prompt/skill you would write). Do only what I select.

## 4. Install / build
- Packages: `pi install <source>`. Skills: install into `~/.claude/skills`.
- Ports and ideas ("port as a small pi extension", "add prompts/x.md"): read the relevant pi docs first (`docs/extensions.md`, `docs/prompt-templates.md`, examples), follow ub-mode (smallest working version, tests where an honest test is possible, gates), and use `worker` + `reviewer` subagents for anything beyond a trivial file.
- Never paste or commit secrets.

## 5. Update existing
- `pi update` for extensions/packages (not `pi update self` unless I ask). Report what changed version.
- `npx skills update` if skills were installed via `npx skills`.
- Note anything that failed to update and why.

## 6. Verify
Run `pi list` and `pi mcp list`; confirm new items load. Remind me to run `/reload` at the end.

## 7. Sync ~/pi-setup
Run `~/pi-setup/sync.sh`, review `git -C ~/pi-setup status`/diff for secrets or session data (abort that file if found), then commit with a message naming the digest date and what was added/updated, and push. No approval step needed for the push.

## 8. Report
A short table: item → action taken (installed / built / updated / skipped + reason), plus the pushed commit SHA.
