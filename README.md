# pi-setup

My portable configuration for [pi](https://github.com/earendil-works/pi-coding-agent), an
LLM-agnostic coding-agent harness. One command installs the agent roster, lifecycle
extensions, reusable prompts, global guidelines, and a self-enforcing code-quality gate.

pi is a harness, not a model — this repo contains only pi-side configuration and tooling.
It deliberately excludes Claude-specific skill content, model credentials, and session history.

## What's inside

```text
home/
  AGENTS.md                      Global guidelines applied to every session
  .pi/agent/
    settings.json                Provider, model, package, and skill configuration
    agents/                      Subagent roster (scout, planner, contrarian, worker, reviewer, cleanup)
    extensions/                  Lifecycle extensions (TypeScript, loaded by pi)
      ub-mode/                   Quality gate: crapper/dryer on edits, blocks bad commits, loop brake
      callimachus/               Mirrors pi sessions into the Callimachus index; /cal-help, /cal-sync, cal-recall skill
      subagent/                  Subagent discovery and dispatch, with per-run budgets
      skill-router/              Suggests an installed skill when a prompt matches its route
      auto-cleanup/              Post-task tidy pass
      no-comments.ts             Rejects code comments on write
      interrupt.ts               Interrupt handling
    prompts/                     Prompt templates: scout-and-plan, implement, implement-and-review, digest
install.sh                       Deploy this repo into $HOME
sync.sh                          Pull live $HOME config back into this repo, then check README coverage
tools/readme-coverage.sh         Lists extensions, agents, prompts, and packages the README does not mention
```

### Packages

Declared in `settings.json`; pi restores them on first launch.

| Package | What it adds |
|---|---|
| `context-mode` | Keeps large tool output out of context (`ctx_execute`, `ctx_search`, ...) |
| `@plannotator/pi-extension` | Interactive plan review with annotations; code/PR review |
| `@juicesharp/rpiv-ask-user-question` | `ask_user_question` structured clarifying questions |
| `@juicesharp/rpiv-todo` | `todo` task list |
| `pi-lens` | LSP diagnostics, symbol search, module reports, ast-grep |
| `cc-safety-net` | Blocks destructive commands and secret-file access |
| `pi-mcp-extension` | MCP client (`mcp_connect`, ...); servers live in `~/.pi/agent/mcp.json` |
| `pi-prs` | Tracks the current branch's PR; `/pr watch --babysit` feeds review threads and CI failures back in |

### Subagents and budgets

The `subagent` extension runs the roster in single, parallel, or chain mode. Each run has
a budget: 1M tokens and 30 minutes by default, overridable per agent with `maxTokens` and
`maxMinutes` in its frontmatter. A run also stops after 5 consecutive tool failures or 5
identical tool calls.

### Skill router

`skill-router/skill-routes.json` maps regex patterns to skill names. When a prompt matches
and the skill is installed in `~/.claude/skills` or `~/.agents/skills`, pi suggests it once
per session.

### PR feedback loop

With `gh` authenticated, `pi-prs` shows review-thread and CI status for the current
branch. `AGENTS.md` tells the agent how to verify each finding, fix it, reply in the thread,
and resolve it.

### Daily digest (`/digest`)

`/digest [date]` reads the "Pi / Claude Code digest" email from Gmail, asks which items to
apply, installs or builds them, runs `pi update` and `pi update --extensions`, then syncs
and pushes this repo. It needs a `gmail` MCP server in `~/.pi/agent/mcp.json` (not synced):

```json
{ "mcpServers": { "gmail": { "command": "npx", "args": ["-y", "@gongrzhe/server-gmail-autoauth-mcp"] } } }
```

### The ub-mode quality gate

The `ub-mode` extension wires Uncle Bob's companion tools into pi as deterministic gates:

- **crapper** — cyclomatic complexity / CRAP score. Functions over the gate (CRAP >= 10,
  or CC > 10 without coverage) are flagged on edit and block commits.
- **dryer** — structural duplication. Clones at or above 0.80 similarity block commits.
- **mutator** — mutation testing (advisory; needs a runnable test suite).

On every edit the gate appends a routing note (which subagent should fix what); on
`git commit` it hard-blocks until the changed files pass. Bypass once with `[skip-ub]`
in the commit message.

The **loop brake** blocks a bash command that already failed twice in a row with no file
edit in between; any edit or write resets it.

### Callimachus (session history search)

The `callimachus` extension needs the standalone `cal` CLI at `~/.local/bin/cal` (it is a
no-op without it). Install the `cal-<target>` binary from
[BetaBots-LLC/callimachus releases](https://github.com/BetaBots-LLC/callimachus/releases),
verify it against `SHA256SUMS`, then run `cal index` and `cal embed`. Inside pi, run
`/cal-sync` once to mirror pi sessions (as Codex-format rollouts in
`~/.local/share/callimachus-pi`, so `codex` in `cal` output means pi), and `/cal-help` for
the usage guide.

## Requirements

- [pi](https://github.com/earendil-works/pi-coding-agent) (`pi`)
- `git`, `node` (v22+), `python3` (for the ub-mode toolchain)

## Install

```bash
git clone https://github.com/lilzem/pi-setup.git
cd pi-setup
./install.sh
```

`install.sh` will:

1. Copy the files under `home/` into `$HOME` (existing files are backed up to `*.bak.<timestamp>`).
2. Clone `crapper`, `dryer`, and `mutator` into `~/.ub-tools/` and write wrapper scripts to `~/.local/bin/`.
3. Add `~/.local/bin` to your `PATH` if missing.
4. Bootstrap each tool's virtualenv.

Then restart your shell and launch `pi` once — it restores the npm packages declared in
`settings.json` and loads the extensions.

Optional: install Chrome's [Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance)
skill, which the scout (`legacy-scan`) and planner (`search`/`retrieve`) use on web UI tasks:

```bash
DISABLE_TELEMETRY=1 npx modern-web-guidance@latest install
echo 'export DISABLE_TELEMETRY=1' >> ~/.zshenv
```

The agent prompts already pass `DISABLE_TELEMETRY=1`; the `~/.zshenv` export also opts out
the skill's own commands in the main session.

## Updating / syncing

After changing your live setup, fold the changes back into the repo and publish:

```bash
./sync.sh
git add -A && git commit -m "sync: update pi setup" && git push
```

`sync.sh` copies only the curated manifest paths, so secrets and session data are never
captured. The same manifest drives both scripts, so install and sync stay in lockstep.

`sync.sh` then runs `tools/readme-coverage.sh` and warns about any extension, agent, prompt,
or package this README does not mention. Document it before committing.
Test the check with `tools/readme-coverage.test.sh`.

## Security

No secrets live in this repo. API tokens are read at runtime from outside it (e.g. provider
auth in `~/.pi/agent/auth.json`, which is git-ignored and never copied). The following are
excluded by both `.gitignore` and the sync manifest: `auth.json`, `models-store.json`,
`trust.json`, `sessions/`, `npm/`, and all virtualenvs.

## License

MIT

