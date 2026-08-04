# Claude Dash — Handover

**Last updated:** 2026-08-04
**Status:** Initial implementation complete, deployed to live Claude Code sessions; usage-snapshot feature added, master reconciled with live drift

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
- ✅ Usage snapshot (`~/.claude/dash/usage-snapshot.json`, written every
  render — added 2026-08-03/04, gives an in-session agent a file to
  read for its own current rate_limits/model/context_window/cost;
  recorded globally in `~/.agents/AGENTS.md` "Claude usage visibility")
- ✅ Standalone segments: `model`, `effort`, `tokens`, `cost` (added
  2026-08-04 reconciliation — config.toml's own docs already promised
  these, master was missing them)
- ✅ `segment_padding_left/right` + `line_separator`/`_char`/`_color`
  (added 2026-08-04, replaces the old `line_spacing` blank-line-only
  mechanism)
- ✅ `DASH_CONFIG` env override for the config file path (added
  2026-08-04, useful for testing against an arbitrary config)

**2026-08-04 reconciliation note**: the installed
`~/.claude/statusline-dash.js` had drifted meaningfully ahead of this
repo's `src/statusline-dash.js` across an unknown number of prior
sessions — someone edited the installed "stable release" copy directly
instead of this repo, in violation of this repo's own `AGENTS.md`
("this repo is the sole source of truth... NEVER modify/sync the
installed copy except on explicit deploy/release"). Reconciled
one-directionally (live → master) in the same session the usage-
snapshot feature was added; `DEFAULTS` also updated to mirror the
operator's real, tuned `~/.claude/dash/config.toml` (3-line layout —
`hyper,5h,7d,ctx` / `model+effort,cost,tokens` / `git,chum` — not the
2-line layout this doc's own Architecture/Configuration sections below
and the README's Segments table still describe (stale, not fixed in
this pass — flagged under Known Issues); `refresh_interval_s: 15`, read
from cache; real thresholds) so a fresh clone/install now behaves like
the tuned live setup out of the box.

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
- This doc's Architecture/Configuration sections and the README's
  Segments table still describe a 2-line layout (`line1`/`line2`) —
  the real, live config has grown to 3 lines (`line1`/`line2`/`line3`)
  and `model`/`effort`/`tokens`/`cost` now exist as standalone segments
  alongside the combined `model+effort`/`tokens+cost`. Not fixed in the
  2026-08-04 reconciliation pass (scope was code parity + the usage-
  snapshot feature, not a full doc audit) — a real gap for whoever
  reads this doc next expecting it to match current behavior.

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
