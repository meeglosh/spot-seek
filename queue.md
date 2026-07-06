---
description: Work through TASKS.md unattended, running the loop on each task in order
argument-hint: (none — reads TASKS.md)
allowed-tools: Read, Grep, Glob, Bash, Task, Edit
model: opus
---

Work through TASKS.md unattended until the queue is exhausted or the budget runs
out. This is the overnight outer loop. The per-task inner cycle is /loop.

Repeat:
1. Read TASKS.md. Pick the first task that is not done and not blocked.
   If none remain, stop and report a summary of the night.
2. Run the inner loop on that task (same procedure as /loop).
3. On ALL GREEN:
   - Mark the task done in TASKS.md.
   - Commit on the task branch with a clear message.
   - Advance to the next task.
4. On any stop condition from CLAUDE.md (5 cycles, repeated failure, regression,
   non-converging failures):
   - Append the task, what was tried, and the real final error to BLOCKED.md.
   - Leave the branch unmerged.
   - Advance to the next unblocked task. One bad task never halts the night.
5. If a task has hit the 5-cycle limit more than once this run, freeze it in
   BLOCKED.md and skip it for the rest of the night.

Honor every hard stop in CLAUDE.md. When a task requires a hard-stop action
(payments, production secrets, auth/security config, destructive migration),
do not attempt it — write it to BLOCKED.md and advance.

Pace against the configured rate limit. Do not burn the whole budget early; the
goal is steady progress across the whole night, not a sprint that stalls at 2am.

End-of-run report: tasks completed, tasks blocked (with reasons), and what is
waiting for a human decision in BLOCKED.md.
