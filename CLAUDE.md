# SpotSeek — agent operating rules

This file is read at the start of every session. It governs what the agents may
attempt and when they must stop. The loop's job is to make checks pass. This
file's job is to define the lines that are never crossed to get there.

## What this app is

SpotSeek is a host-centric platform for creating, discovering, attending, and
(later) sponsoring watch parties. A **host** owns an event. A **venue** is an
optional attribute of an event, not its owner — so a host can change venue by
editing one field without migrating anything. Attendees discover events and RSVP.
Sponsors (phase 2) fund events or attach offers.

The host owns the event. The venue hangs off it. Never invert this.

## Hard stops — never attempt without writing to BLOCKED.md first

These are not "stop when stuck" rules. These are "never do this autonomously"
rules. If a task requires any of the following, do not do it. Write the task and
the reason to BLOCKED.md and move to the next unblocked task.

- No production deploys. Dev and preview only.
- No real payment keys, no live Stripe/processor credentials, no real charges.
  Payment work uses test-mode keys and test fixtures only.
- No destructive database migrations against anything but a dev branch. No
  dropping columns/tables or irreversible data transforms on shared/preview DBs.
- No auth or security config changes (Better Auth provider config, session/cookie
  settings, CORS, secrets) without a BLOCKED.md flag for human review.
- No editing of files outside the scope declared in the task brief.
- No weakening, skipping, or deleting a check to reach ALL GREEN. (Repeated below
  because it is the most likely rule to get rationalized away.)

## Loop stop rules

The team loops until one of these is true:

- ALL GREEN: every check passes. Stop and report success with the checker's
  output from the final cycle as proof.
- 5 cycles used: stop. Report what still fails and what was tried.
- Same failure twice in a row: stop. The builder is guessing, not fixing.
  Escalate via BLOCKED.md.
- A previously passing check now fails: stop. Something is being broken to fix
  something else.
- Rotating failures that do not converge across cycles: treat as stuck. Stop.

Never report success without checker output from the final cycle.
Never weaken or delete a check to reach ALL GREEN.

## Queue-runner rules (overnight behavior)

- Pull the next unblocked task from TASKS.md in order.
- Run the loop on it.
- On ALL GREEN: mark the task done in TASKS.md, commit on the task branch, advance.
- On any stop condition: write the task + what was tried + the real final error
  to BLOCKED.md, leave it unmerged, advance to the next unblocked task.
- If a task hits the 5-cycle limit more than once across the run, freeze it in
  BLOCKED.md and do not re-attempt it tonight.
- One bad task must never cost the whole run. Always advance.

## Definition of done (per task)

A task is done only when the checker reports ALL GREEN, which means:
1. Tests pass
2. Types check (tsc --noEmit, strict)
3. Lint passes
4. Bundle/build succeeds (once the harness task has established this check)

Work happens on a branch per task. A bad run is one `git checkout` from gone.

## Escalation interface

BLOCKED.md is the morning interface. Anything the human must decide goes there,
not into a silent guess. Categories that always go to BLOCKED.md:
- Anything touching money/payments
- Anything touching production secrets or auth/security config
- Any hard-to-reverse schema change
- Any product-behavior ambiguity not resolved in the spec or TASKS.md
