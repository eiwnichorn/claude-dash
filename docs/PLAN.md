# Claude Dash — Plan

**Last updated:** 2026-07-27  
**Status:** v1 complete, exploring enhancements

## Milestone 1: Initial Implementation ✅

**Goal:** Replace `usage-bar` with a more comprehensive, configurable status bar.

**Delivered:**
- Two-line layout (session identity + resource meters)
- Config-driven segments (TOML)
- Anti-lockout design (<100ms main script)
- Background Hyper API refresh (2s timeout)
- Git branch detection (no subprocess)
- Chum session tracking
- Color-coded thresholds
- Windows compatibility

**Status:** ✅ COMPLETE (2026-07-27)

## Milestone 2: Polish & UX

**Goal:** Improve visual clarity, add missing features, refine configuration.

### Tasks

- [ ] **Add reset countdown to rate limits** — show time until 5h/7d reset (e.g., "2h 30m")
- [ ] **Enable git dirty detection by default** — change `git_show` default to `"branch+dirty"`
- [ ] **Add line spacing config** — allow vertical gap between lines (configurable)
- [ ] **Unified separator style** — use bullets (·) on both lines instead of pipes (|) on line 2
- [ ] **ASCII character reference** — document available Unicode symbols for customization

**Status:** 🔄 IN PROGRESS

## Milestone 3: Advanced Features

**Goal:** Extend functionality based on usage patterns.

### Potential Enhancements

- [ ] **Custom segment support** — allow user-defined segments via config
- [ ] **Theme presets** — bundled color schemes (minimal, colorful, monochrome)
- [ ] **Conditional segments** — show/hide based on context (e.g., only show Hyper when using Hyper models)
- [ ] **Multi-line support** — optional third line for additional info
- [ ] **Performance profiling** — identify slow segments, optimize further
- [ ] **Plugin system** — allow third-party segments via external scripts

**Status:** 📋 PLANNED

## Milestone 4: Distribution

**Goal:** Make claude-dash easy to install and share.

### Tasks

- [ ] **Installer script** — one-command setup (`curl ... | bash`)
- [ ] **Package.json** — npm distribution (optional)
- [ ] **Documentation site** — hosted docs with examples
- [ ] **Gallery** — showcase user configurations
- [ ] **Migration guide** — help `usage-bar` users transition

**Status:** 📋 PLANNED

## Architecture Decisions

### Why Node.js over Rust/Go?

**Decision:** Use Node.js for v1, reconsider for v2 if performance becomes an issue.

**Rationale:**
- Node.js startup: ~30-50ms (acceptable for status bar)
- Rust/Go startup: ~5ms (marginal gain)
- Network I/O dominates (Hyper API: 100-500ms)
- Node.js has built-in `fetch()`, `JSON.parse()`, `fs` — no external dependencies
- Faster development, easier maintenance
- Every Claude Code user has Node.js installed

**Revisit if:**
- Startup time becomes a bottleneck (unlikely)
- Need to distribute to non-Node.js environments
- Want single binary with no runtime

### Why Two-Script Pattern?

**Decision:** Separate main renderer from Hyper API updater.

**Rationale:**
- Main script must exit in <100ms to prevent UI lockout
- Hyper API calls take 100-500ms (or 2s on timeout)
- Background process allows main script to exit immediately
- Cache file provides instant access to last-known balance
- Next event sees updated cache

**Alternative considered:**
- Inline Hyper fetch with timeout — risks UI lag
- Polling on interval — wastes API calls when idle
- Hook-based refresh — Claude Code doesn't expose hook API for status bar

### Why Event-Driven + Polling?

**Decision:** Run on every event + 5-minute refresh interval.

**Rationale:**
- Event-driven: instant updates when user is active
- Polling: keeps countdown timers accurate during idle periods
- 5-minute interval: balances freshness vs. API cost
- No `refreshInterval` by default in v1 — added after user request

**Trade-offs:**
- More frequent updates = more accurate countdowns
- But also more API calls (Hyper) and CPU usage (minimal)
- 5 minutes is a reasonable default

## Open Questions

1. **Should we add a "session age" segment?** — show how long the current session has been running
2. **Should we support multiple Hyper accounts?** — team/organization balances
3. **Should we add a "cost per token" metric?** — real-time pricing feedback
4. **Should we integrate with other providers?** — OpenAI, Anthropic direct, etc.
5. **Should we add a "model switcher" segment?** — quick model change from status bar (probably out of scope)

## Retrospective

### What Went Well

- **Anti-lockout design** — critical constraint identified early, prevented user frustration
- **Two-script pattern** — clean separation of concerns, easy to reason about
- **Config-driven** — flexible without code changes
- **Windows compatibility** — tested on MSYS/Git Bash, no major issues
- **Dispatch to DeepSeek V4 Flash** — fast, cheap, accurate implementation

### What Could Be Better

- **Git dirty detection** — spawns subprocess, could be optimized (read index directly?)
- **Chum scanning** — reads all jetsam files, could be slow with many sessions
- **Error handling** — some segments fail silently, could be more verbose
- **Testing** — no automated tests yet, manual verification only

### Lessons Learned

- **UI responsiveness is critical** — a slow status bar is worse than no status bar
- **Background processes are tricky** — detached processes can pile up if not managed
- **Windows path handling** — always test on Windows, MSYS quirks are real
- **Config format matters** — TOML is readable, but parsing is manual (no external deps)
- **Dispatch works well for mechanical tasks** — DeepSeek V4 Flash implemented the entire v1 correctly

## References

- **Claude Code status line docs:** https://code.claude.com/docs/en/statusline
- **usage-bar skill:** `~/.agents/skills/usage-bar/` (retired)
- **Hyper skill:** `~/.agents/skills/hyper/SKILL.md`
- **Chum skill:** `~/.agents/skills/chum/SKILL.md`
- **Dispatch skill:** `~/.agents/skills/dispatch/SKILL.md`
