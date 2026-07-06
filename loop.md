---
description: Run the builder and checker in a loop until all checks pass
argument-hint: <task>
allowed-tools: Read, Grep, Glob, Bash, Task
model: opus
---

Run this task as a loop: $ARGUMENTS

1. Write a one-line brief: goal, files in scope, definition of done.
2. Dispatch the builder to implement the task.
3. Dispatch the checker to run all checks.
4. If checker says ALL GREEN: stop, show me the result with the checker's
   final-cycle output as proof.
5. If checker says FAILED: send the failures to the builder to fix, then go back
   to step 3.
6. Repeat up to 5 cycles. Track the cycle count out loud.

Stop conditions are in CLAUDE.md. Follow them exactly. Never weaken or delete a
check to reach ALL GREEN. Never report success without checker output from the
final cycle.
