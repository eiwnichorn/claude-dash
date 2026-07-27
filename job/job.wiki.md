# Claude Dash — Job Wiki

Index of specs, prompts, and session logs for claude-dash work.

## Active Jobs

_None currently active._

## Completed Jobs

| Job ID | Title | Status | Spec | Prompt | Session |
|--------|-------|--------|------|--------|---------|
| P1 | Initial implementation (pi hyper deepseek-v4-flash) | ✅ COMPLETE | [spec](job/done/P1-pi-hyper-claude-dash/spec.md) | [prompt](job/done/P1-pi-hyper-claude-dash/prompt.md) | [session](job/done/P1-pi-hyper-claude-dash/session.md) |

## Job ID Convention

- **P1, P2, ...** — pi lane dispatches
- **C1, C2, ...** — claude lane dispatches
- **L1, L2, ...** — lcf chaton dispatches

Suffix with model if relevant: `P1-hyper-deepseek`, `C1-opus`, etc.

## How to Add a Job

1. Create spec in `job/spec/<job-id>.md`
2. Create prompt in `job/prompt/<job-id>.md`
3. Add row to this table with status: 🔄 IN PROGRESS
4. On completion:
   - Move spec, prompt, session log to `job/done/<job-id>/`
   - Update status: ✅ COMPLETE
   - Update `docs/HANDOVER.md` Job State table
