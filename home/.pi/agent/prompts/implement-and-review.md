---
description: Worker implements, reviewer reviews, worker applies feedback
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "worker" agent to implement: $@
2. Then, use the "reviewer" agent to review the implementation from the previous step, verifying every claim in the worker's summary against the files and diff (use {previous} placeholder)
3. Finally, use the "worker" agent to apply the feedback from the review, fixing every ✗ claim first (use {previous} placeholder)

Do not report the task as done while the reviewer's Claim Check has any ✗ that the final worker step did not resolve.

Execute this as a chain, passing output between steps via {previous}.

After the chain, if the reviewer's Bouncer Proposal names a command, ask the user with ask_user_question whether to run it. Run it only after approval, with the original ticket text on stdin (the user's words, never a summary of the work). Show the full list of unstated decisions and let the user answer each open item before any commit. Offer `bouncer check` (about $1–4, 10–25 min) only for billing or grading logic, and only on request.
