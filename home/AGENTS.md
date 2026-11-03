<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:no-comments-rule -->
# Code comments

Do not write comments in code unless explicitly asked to. Write self-explanatory code instead.
<!-- END:no-comments-rule -->

<!-- BEGIN:subagent-trigger -->
# Subagent delegation (self-triggered)

Trigger the `subagent` tool yourself — never wait to be told. Nothing else fires it,
so it only happens if you consciously decide to.

Self-trigger a **parallel** fan-out the moment you have **2+ tasks that are all**:
- independent (no ordering dependency between them), and
- read-only or writing to disjoint areas, and
- free of shared live state (not the same dev server/port, single build, or git working
  tree being mutated), and
- low-feedback (won't need several rounds of "adjust based on what we just saw").

Typical fits: multi-file/codebase audits, parallel research, import-graph or dependency
mapping, scoping several independent fixes at once. Then synthesize the results yourself.

Use **chain** mode for pipelines where each stage transforms the previous
(research → design → implement), passing `{previous}`.

Keep **inline** (do NOT delegate): iterative measure→adjust loops, anything on shared
live state (running dev server, ports, one build/test at a time, mid-change git tree),
quick edits where delegation overhead dominates, and judgment-heavy calls that are hard
to specify as a standalone brief.

When you spawn subagents, say so briefly and why; when a task clearly fits this rule but
you choose to stay inline, state the reason.
<!-- END:subagent-trigger -->

<!-- BEGIN:ub-mode -->
# Engineering discipline (ub-mode)

Adapted from Uncle Bob's `ub-mode`. Every change follows three ordered phases:
**First Make it Work → Then Make it Right → Practice.** Do not skip ahead.

## First Make it Work

- **Laziness Protocol** — One decision lives in one place. Ship the smallest edit that solves the problem.
- **Foundational thinking** — Get the data shape right before the logic. Do first whatever helps every later phase. If a concurrent writer would matter, do not share state.
- **TDD** — Write the failing test first and watch it fail for the reason you expect, then make the smallest change that passes. If an honest test is impractical, do not write a bad one.
- **Redesign from first principles** — Do not bolt a new requirement onto the old design. Ask what you'd have built if it were there from the start, then deliver it in pieces.
- **Attack the premise** — When two fixes sharing one assumption fail the same way, write that assumption in one sentence, remove it, and fix nothing else until it's gone.
- **Subtract before you add** — Take complexity out before adding anything.
- **Outcome-oriented** — Aim at an end state you can check. A planned, reversible break mid-way is allowed.
- **Build the lever** — If the work isn't obvious at a glance, do one unit by hand, then build the tool that matches it.
- **Architecture** — Model the domain so illegal states are impossible; keep a glossary of domain terms. Validate data at the boundary, then trust it inside; keep business logic pure. Make illegal values impossible to write and parse external data once at entry — never silence the compiler. Make operations idempotent. If two paths don't need the same mutable state, give each its own; if they do, allow one writer and enforce it structurally.

## Then Make it Right

- **Fix root causes** — Reproduce it, fix the cause. A guard that only hides the crash is not a fix.
- **Sequence into verifiable units** — Finish one small unit and check it before starting the next.
- **Test behavior, not implementation** — Tests call the code the way its user does and check what that user sees. If a test would still pass when every function returned nothing, delete it.
- **Quality gates** — Run Uncle Bob's deterministic tools (installed in `~/.ub-tools`, on PATH via `~/.local/bin`) on the files you changed, then route the fixes to pi subagents. Prefer `--changed` to scope to the current diff.
  - Complexity — `crapper --changed --threshold 10` (exit 2 means a function scored above CRAP 10). Reduce by splitting or testing. (`reviewer` flags, `worker` splits)
  - Duplication — `dryer --threshold 0.8 <paths>` reports structural duplicates at ≥ 0.8 similarity. Eliminate them. (`reviewer` flags, `worker` refactors)
  - Mutation — `mutator --changed` (exit 3 means a mutant survived, exit 2 means baseline tests failed). Cover the uncovered, kill survivors, delete dead code. (`worker` adds tests, `cleanup` removes dead code)
- **Refactoring** — Pin what the code does, change the structure, prove behavior didn't change.

## Practice

- **Keep a log** — Record each action and why; report it on completion. Offload bulk investigation to the `scout` subagent and keep only its summary.
- **Guard the context window** — Keep the main thread small; push bulk work to subagents (see subagent-trigger rule) and keep only the summary.
- **Worktree cleanup** — Find what's safe to remove, confirm nothing in use needs it, then reclaim. Uncommitted work waits for a decision. (`cleanup` subagent)
- **Commit and push** — Commit often in small ordered commits; each says why, what changed, and how you proved it. Push to the main line at the end.
<!-- END:ub-mode -->
