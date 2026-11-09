---
description: Scout gathers context, planner creates implementation plan, contrarian challenges it when the change is non-trivial (no implementation)
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to find all code relevant to: $@
2. Then, use the "planner" agent to create an implementation plan for "$@" using the context from the previous step (use {previous} placeholder)
3. If the plan touches more than one file, changes data shapes or public interfaces, or rests on an unverified bug hypothesis, use the "contrarian" agent to challenge the plan: "Challenge this plan for '$@': {previous}"

Execute this as a chain, passing output between steps via {previous}. Skip step 3 for small local plans. Do NOT implement — return the plan, plus the contrarian's verdict and any confirmed objections folded into a revised plan.
