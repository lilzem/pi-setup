---
description: Worker implements, reviewer reviews, worker applies feedback
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "worker" agent to implement: $@
2. Then, use the "reviewer" agent to review the implementation from the previous step, verifying every claim in the worker's summary against the files and diff (use {previous} placeholder)
3. Finally, use the "worker" agent to apply the feedback from the review, fixing every ✗ claim first (use {previous} placeholder)

Do not report the task as done while the reviewer's Claim Check has any ✗ that the final worker step did not resolve.

Execute this as a chain, passing output between steps via {previous}.
