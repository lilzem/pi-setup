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
      subagent/                  Subagent discovery and dispatch
      auto-cleanup/              Post-task tidy pass
      no-comments.ts             Rejects code comments on write
      interrupt.ts               Interrupt handling
    prompts/                     Reusable prompt templates (scout-and-plan, implement, ...)
install.sh                       Deploy this repo into $HOME
sync.sh                          Pull live $HOME config back into this repo
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
the usage guide. For the same guide in a plain terminal, link the shell command:
`ln -sf ~/.pi/agent/extensions/callimachus/bin/cal-help ~/.local/bin/cal-help`.

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

## Updating / syncing

After changing your live setup, fold the changes back into the repo and publish:

```bash
./sync.sh
git add -A && git commit -m "sync: update pi setup" && git push
```

`sync.sh` copies only the curated manifest paths, so secrets and session data are never
captured. The same manifest drives both scripts, so install and sync stay in lockstep.

## Security

No secrets live in this repo. API tokens are read at runtime from outside it (e.g. provider
auth in `~/.pi/agent/auth.json`, which is git-ignored and never copied). The following are
excluded by both `.gitignore` and the sync manifest: `auth.json`, `models-store.json`,
`trust.json`, `sessions/`, `npm/`, and all virtualenvs.

## License

MIT

