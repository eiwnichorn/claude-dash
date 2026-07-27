# Claude Dash

A two-line status bar for Claude Code that displays session identity and resource meters.

![Claude Dash](https://img.shields.io/badge/claude-dash-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D16-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Two-line layout** — session identity (line 1) and resource meters (line 2)
- **Config-driven** — TOML configuration for segments, thresholds, colors
- **Anti-lockout design** — main script exits in <100ms, never blocks Claude Code UI
- **Background Hyper refresh** — detached process with 2s timeout
- **Git integration** — branch + repo name detection (no subprocess)
- **Chum tracking** — session save status with relative timestamps
- **Color-coded thresholds** — green/orange/red for context, rate limits
- **Windows compatible** — tested on MSYS/Git Bash

## Installation

### Via Skill (Recommended)

```bash
# Install the skill
cp -r ~/.agents/skills/claude-dash ~/.agents/skills/claude-dash.backup 2>/dev/null || true
cp -r /path/to/claude-dash ~/.agents/skills/claude-dash

# Install runtime files
cp ~/.agents/skills/claude-dash/src/statusline-dash.js ~/.claude/
cp ~/.agents/skills/claude-dash/src/hyper-update.js ~/.claude/
chmod +x ~/.claude/statusline-dash.js ~/.claude/hyper-update.js

# Create config directory
mkdir -p ~/.claude/dash
cp ~/.agents/skills/claude-dash/config/config.toml ~/.claude/dash/

# Update Claude Code settings
# Add to ~/.claude/settings.json:
# "statusLine": {
#   "type": "command",
#   "command": "~/.claude/statusline-dash.js",
#   "refreshInterval": 300
# }
```

### Manual Installation

```bash
# Copy scripts
cp src/statusline-dash.js ~/.claude/
cp src/hyper-update.js ~/.claude/
chmod +x ~/.claude/statusline-dash.js ~/.claude/hyper-update.js

# Create config
mkdir -p ~/.claude/dash
cp config/config.toml ~/.claude/dash/

# Update settings.json (see above)
```

## Configuration

Edit `~/.claude/dash/config.toml`:

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
line_spacing = 0
```

## Segments

### Line 1 (Session Identity)

| Segment | Description | Example |
|---------|-------------|---------|
| `git` | Git branch + repo name | `chum-src/main` |
| `model+effort` | Model name + effort level | `Opus · high` |
| `tokens+cost` | Input/output tokens + cost | `↑15.2k ↓1.2k · $0.12` |
| `chum` | Chum session save status | `chum ✓ 23m` |

### Line 2 (Resource Meters)

| Segment | Description | Example |
|---------|-------------|---------|
| `hyper` | Hyper credit balance | `◆ 242 hc` |
| `5h` | 5-hour rate limit + countdown | `5h ██░░░░░░ 28% 2h 30m` |
| `7d` | 7-day rate limit + countdown | `7d ███████░ 85% 1d 5h` |
| `ctx` | Context window usage | `ctx ████░░░░ 42%` |

## Architecture

### Two-Script Pattern

1. **Main script** (`statusline-dash.js`) — event-driven, <100ms
   - Reads stdin JSON from Claude Code
   - Reads Hyper cache (instant)
   - Reads git branch (no subprocess)
   - Reads chum jetsam files
   - Renders two lines with ANSI colors
   - Spawns detached background process
   - Exits immediately

2. **Background updater** (`hyper-update.js`) — detached, 2s timeout
   - Fetches Hyper API
   - Writes cache file
   - Exits

### Anti-Lockout Guarantees

- No `refreshInterval` by default — purely event-driven
- Hard 2s timeout on Hyper fetch via `AbortController`
- Every segment degrades independently
- Total main script timeout: <100ms

## Development

### Project Structure

```
claude-dash/
├── AGENTS.md           # Project rules and workflow
├── README.md           # This file
├── .gitignore
├── src/
│   ├── statusline-dash.js   # Main renderer
│   └── hyper-update.js      # Background updater
├── config/
│   └── config.toml          # Default config
├── docs/
│   ├── HANDOVER.md          # Project state
│   └── PLAN.md              # Roadmap
└── job/
    ├── job.wiki.md          # Job index
    ├── spec/                # Active specs
    ├── prompt/              # Active prompts
    ├── sessions/            # Session logs
    └── done/                # Completed jobs
```

### Testing

```bash
# Manual test with mock JSON
echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":42},"session_id":"test","workspace":{"current_dir":"C:\\\\Users\\\\MacGyver\\\\dev\\\\repo\\\\00-cyrano"},"rate_limits":{"five_hour":{"used_percentage":28,"resets_at":'$(($(date +%s)+7200))'},"seven_day":{"used_percentage":85,"resets_at":'$(($(date +%s)+86400))'}}}' | node ~/.claude/statusline-dash.js

# Performance test
time (echo '{...}' | node ~/.claude/statusline-dash.js)
```

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built for [Claude Code](https://code.claude.com)
- Inspired by [usage-bar](https://github.com/bhutano/claude-usage-bar)
- Hyper credit integration via [pi-hyper-provider](https://github.com/charmland/pi-hyper-provider)

## Resources

- **Documentation:** [docs/](docs/)
- **Project Plan:** [docs/PLAN.md](docs/PLAN.md)
- **Handover Notes:** [docs/HANDOVER.md](docs/HANDOVER.md)
- **Claude Code Status Line Docs:** https://code.claude.com/docs/en/statusline
