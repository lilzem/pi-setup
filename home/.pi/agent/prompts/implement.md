---
description: Full implementation workflow - scout gathers context, planner creates plan, worker implements
---
Before the chain, if the current directory is a git repository, call the `worktree_create` tool with mode `new-branch`, baseRef `main`, and a short kebab-case branch name derived from the task (prefix with the ticket id when one is given, e.g. `DEV-1234-fix-login`). Run every chain step with `cwd` set to the new worktree path. Skip this if already inside a non-main worktree.

Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create an implementation plan for "$@" using the context from the previous step (use {previous} placeholder)
3. Finally, use the "worker" agent to implement the plan from the previous step (use {previous} placeholder)

Execute this as a chain, passing output between steps via {previous}.
