# BLOCKED — human decisions waiting

The agents write here instead of guessing. Read this each morning. Empty is good.

<!-- Format per entry:
## <task id> — <one line>
- What it needs: 
- Why it is blocked (which hard-stop or ambiguity): 
- What was tried: 
- Real final error (verbatim, if any): 
-->

## 1.1 — Cascade-on-user-delete behavior needs a human decision

- What it needs: A chosen cascade strategy for `DELETE FROM users` when that user has events or RSVPs.
- Why it is blocked: CLAUDE.md and DATA_MODEL.md both require this decision be made explicitly by a human. The options are: (a) RESTRICT — block user deletion if they own any event or have any RSVP; (b) CASCADE — delete all owned events (and their RSVPs) and the user's RSVP rows; (c) SET NULL — null out host_id on events (violates the NOT NULL invariant, so this option is invalid). The schema currently has no ON DELETE clause on the FKs while we wait for this decision.
- What was tried: n/a — flagged before implementing, per CLAUDE.md rules.
- Real final error (verbatim, if any): n/a
