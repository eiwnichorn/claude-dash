---
slug: claude-dash-agents
summary: >
  Rules and workflow doc for claude-dash — boot sequence, directory
  conventions, dispatch pointer, project-specific rules; also claude-dash's
  current thin-leaf overview (Project section).
related: [[claude-dash-handover]], [[claude-dash-plan]], [[claude-dash-design]]
---

# AGENTS.md — Claude Dash

**Global rules:** [`~/.agents/AGENTS.md`](/c/Users/MacGyver/.agents/AGENTS.md) — roles, workflow, dispatch, chum, git, code conventions.

## Project

Claude Dash — two-line status bar for Claude Code displaying session identity and resource meters.

**Architecture:** Node.js script reads Claude Code's stdin JSON (event-driven), renders two lines with ANSI colors, spawns detached background process for Hyper API refresh. Main script exits in <100ms to prevent UI lockout.

**Current state:** Initial implementation complete. Two-script pattern (main renderer + background Hyper updater) working. Config-driven segments, color thresholds, git branch detection, chum session tracking, Hyper credit balance display.

## Boot Sequence

1. Read `~/.agents/AGENTS.md` — global workspace rules.
2. Read `docs/HANDOVER.md` — project state.
3. Read `docs/PLAN.md` — roadmap and architecture.
4. Check `job/current-job.md` — active work order?
5. Check `job/job.wiki.md` — spec and prompt index.

## Directory Conventions

| Directory | Purpose |
|-----------|---------|
| `docs/HANDOVER.md` | Project state (persistent) |
| `docs/PLAN.md` | Roadmap and architecture |
| `docs/notes/` | Scratchpad, non-canon |
| `job/done/` | Archived completed jobs (specs, prompts, sessions) |
| `job/spec/` | Active specs |
| `job/prompt/` | Active prompts |
| `job/sessions/` | Session logs |
| `job/current-job.md` | Active work order (transient) |
| `job/job.wiki.md` | Index of specs and prompts |
| `src/` | Source code (statusline-dash.js, hyper-update.js) |
| `config/` | Default config files |

## Project-Specific Rules

- Claude Dash is a Claude Code extension — changes affect the status bar UI.
- Test on Windows (MSYS/Git Bash) before merging — path handling quirks.
- Node.js is the implementation language — no bash/Python for core logic.
- Main script must exit in <100ms — never block Claude Code's UI.
- Hyper API calls run in detached background process with 2s timeout.
- Every segment degrades independently — one fails, rest still render.
- Config is TOML format — simple parser, no external dependencies.

## Architecture

### Components

| Component | Language | Purpose |
|-----------|----------|---------|
| `statusline-dash.js` | Node.js | Main renderer (reads stdin JSON, renders two lines) |
| `hyper-update.js` | Node.js | Background Hyper API updater (detached process) |
| `config.toml` | TOML | User configuration (segments, thresholds, colors) |
| `hyper-cache.json` | JSON | Cached Hyper credit balance |

### Anti-Lockout Design

```
Event trigger (message/compact/etc)
        ↓
  statusline-dash.js
        ↓
  Read stdin JSON (instant)
        ↓
  Read Hyper cache (instant)
        ↓
  Read git branch (instant, no subprocess)
        ↓
  Read chum jetsam (instant)
        ↓
  Render two lines (instant)
        ↓
  Spawn detached background process
        ↓
  Exit (<100ms total)

Background process (hyper-update.js):
  Fetch Hyper API (2s timeout)
        ↓
  Write cache file
        ↓
  Exit
```

- No `refreshInterval` by default — purely event-driven
- Hard 2s timeout on Hyper fetch via `AbortController`
- Every segment degrades independently — one fails, rest still render
- Total main script timeout: <100ms

### Segment Architecture

**Line 1 (Session Identity):**
- `git` — branch name + repo name (e.g., `chum-src/main`)
- `model+effort` — model name + effort level (e.g., `Opus · high`)
- `tokens+cost` — input/output tokens + session cost (e.g., `↑15.2k ↓1.2k · $0.12`)
- `chum` — chum session save status (e.g., `chum ✓ 23m`)

**Line 2 (Resource Meters):**
- `hyper` — Hyper credit balance (e.g., `◆ 242 hc`)
- `5h` — 5-hour rate limit with countdown (e.g., `5h ██░░░░░░ 28% 2h 30m`)
- `7d` — 7-day rate limit with countdown (e.g., `7d ███████░ 85% 1d 5h`)
- `ctx` — context window usage (e.g., `ctx ████░░░░ 42%`)

### Configuration

```toml
# Line layout (comma-separated segments)
line1 = "git,model+effort,tokens+cost,chum"
line2 = "hyper,5h,7d,ctx"

# Separators
section_sep = " | "
item_sep = " · "

# Git
git_show = "branch+dirty"  # "branch" or "branch+dirty"

# Thresholds
ctx_warn = 70
ctx_crit = 80
rate_warn = 80
rate_crit = 90

# Hyper
hyper_timeout_ms = 2000

# Bar style
bar_width = 8
bar_filled = "█"
bar_empty = "░"

# Spacing
line_spacing = 0  # number of blank lines between line1 and line2
```

### Installation

**Skill directory:** `~/.agents/skills/claude-dash/`
- `SKILL.md` — skill definition
- `scripts/statusline-dash.js` — main script
- `scripts/hyper-update.js` — background updater

**Runtime files:**
- `~/.claude/statusline-dash.js` — main script (copy)
- `~/.claude/hyper-update.js` — background updater (copy)
- `~/.claude/dash/config.toml` — user configuration
- `~/.claude/dash/hyper-cache.json` — cached Hyper balance

**Claude Code settings:**
```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline-dash.js",
    "refreshInterval": 300
  }
}
```

## LLM Lane Discipline

When operating as orchestrator (not self-implementing), the lane ladder for
this project uses the following model assignments. These are **defaults** —
the user can override per-task.

| Role | Model | Purpose |
|------|-------|---------|
| Orchestrator | **Claude Opus** | Leads exploration, plans, breaks down ambiguity, writes specs |
| Advisor | **Claude Sonnet** | Review, analysis, verification, second opinions |
| Executor | **DeepSeek V4 Flash** | Mechanical implementation against locked spec |

### Rules

1. **No write or execution inline** — the orchestrator does not write
code or execute commands during a non-Anthropic session. Discuss, plan,
review, and delegate. Exception: read-only toolcalls (file reads, git status)
are allowed to gather context.

2. **Confirm before dispatch** — before invoking `/dispatch` or spawning any
subagent, **ask the user first**. No silent outsourcing. If the user says
"dispatch to X" or "send it", that is the confirmation.

3. **Skill gate** — `/dispatch` must route through the `dispatch` skill
(`skills/dispatch/SKILL.md`). No ad-hoc prompt files, no bypassing the skill.

4. **User is the override** — the table above is the default lane. The user
can redirect any role to a different model, or declare "self-implement" to
keep execution in the current session.

### docs/notes/

- `docs/notes/` is a scratchpad for non-canon working notes.
- When a note's content is absorbed into canonical docs (`HANDOVER.md`, `PLAN.md`, or specs), move it to `docs/notes/stale/`.
- Stale notes are kept for history but are not referenced by boot or active work.

### job/

- `job/done/` holds completed jobs (specs, prompts, sessions).
- Active work goes in `job/spec/`, `job/prompt/`, `job/sessions/`.
- When a job is **COMPLETE** (spec done, prompt fulfilled, nothing outstanding):
  1. Verify all deliverables landed (code merged, tests pass).
  2. Move the spec, prompt, and session log to `job/done/<subdir>/`.
  3. Update `job/job.wiki.md` to point to the new `done/` paths.
  4. Update `docs/HANDOVER.md` Job State table paths.
- `job/current-job.md` should only exist when a job is in flight.
- `job/done/` is append-only archive — never edit moved files.

> **ISOLATION RULE — LLM GUARDRAIL**
>
> This repo is the **sole source of truth** for all claude-dash work. We are
> working in isolation here. **NEVER** modify, copy, or sync files to
> `~/.agents/skills/claude-dash/` or any external skill directory unless the
> user explicitly says the exact words "deploy to skill" or "release".
>
> If tempted to "update the installed skill" or "sync to skill dir":
> STOP. That is outside scope. Ask the user first.
>
> The existing warning below is a human-readable summary of the same
> rule. Both apply.

> **DO NOT DISOBEY**
> 
> Do NOT copy files to `~/.agents/skills/claude-dash/` or any local skill directory.
> The installed skill files are a stable release. Changes in this repo are in-progress.
> Only copy to skill directories when explicitly told "deploy to skill" or "release".
> Work in this repo only. The repo IS the source of truth until a stable release.
