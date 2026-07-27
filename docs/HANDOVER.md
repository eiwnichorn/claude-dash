# Claude Dash — Handover

**Last updated:** 2026-07-27  
**Status:** Initial implementation complete, deployed to live Claude Code sessions

## Current State

Claude Dash is a two-line status bar for Claude Code that displays session identity and resource meters. The implementation is complete and actively used.

### What's Working

- ✅ Two-line layout with configurable segments
- ✅ Git branch + repo name detection (no subprocess, reads `.git/HEAD` directly)
- ✅ Model + effort level display
- ✅ Token usage (input/output) + session cost
- ✅ Chum session tracking (scans jetsam files for current session)
- ✅ Hyper credit balance (background refresh, 2s timeout)
- ✅ Rate limit meters (5h, 7d) with countdown timers
- ✅ Context window usage meter
- ✅ Color-coded thresholds (green/orange/red)
- ✅ Config-driven (TOML format)
- ✅ Anti-lockout design (<100ms main script exit)
- ✅ Windows-compatible (MSYS/Git Bash tested)

### Architecture

**Two-script pattern:**
1. `statusline-dash.js` — main renderer (event-driven, <100ms)
2. `hyper-update.js` — background Hyper API updater (detached, 2s timeout)

**Event-driven + polling:**
- Runs on every Claude Code event (message, compact, etc.)
- `refreshInterval: 300` (5 minutes) for idle countdown updates
- No UI blocking — main script exits immediately

### Configuration

User config at `~/.claude/dash/config.toml`:
- Segment order (line1, line2)
- Separators (section_sep, item_sep)
- Thresholds (ctx_warn, ctx_crit, rate_warn, rate_crit)
- Bar style (width, fill/empty chars)
- Git display mode (branch, branch+dirty)

### Known Issues

- Windows file locking can prevent `usage-bar` skill directory removal (cosmetic,不影响功能)
- Git dirty detection spawns subprocess (500ms timeout, graceful degradation)

## Job State

| Job | Status | Location |
|-----|--------|----------|
| Initial implementation | ✅ COMPLETE | `job/done/P1-pi-hyper-claude-dash/` |

## Next Steps

See `docs/PLAN.md` for roadmap.

## References

- **Spec:** `job/done/P1-pi-hyper-claude-dash/spec.md`
- **Prompt:** `job/done/P1-pi-hyper-claude-dash/prompt.md`
- **Session log:** `job/done/P1-pi-hyper-claude-dash/session.md`
- **Skill:** `~/.agents/skills/claude-dash/SKILL.md`
- **Claude Code docs:** https://code.claude.com/docs/en/statusline
