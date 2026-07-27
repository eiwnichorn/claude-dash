#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────
//  statusline-dash.js  —  Status bar for Claude Code
//
//  Reads stdin JSON from Claude Code, renders a two-line status
//  bar with session identity (line 1) and resource meters (line 2).
//  Spawns a detached background process for Hyper API refresh.
//
//  Design: Never block Claude Code's UI. Exit in <100ms.
// ──────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── ANSI colors ──────────────────────────────────────────────
const C = {
  GREEN: '\033[32m',
  ORANGE: '\033[38;5;208m',
  RED: '\033[31m',
  CYAN: '\033[36m',
  BOLD: '\033[1m',
  DIM: '\033[2m',
  RESET: '\033[0m',
  HYPER_GEM: '\033[38;2;255;96;255m◆\033[39m', // Magenta diamond (matches pi's Hyper extension)
};

// ── Paths ────────────────────────────────────────────────────
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = path.join(HOME, '.claude', 'dash');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.toml');
const HYPER_CACHE_FILE = path.join(CONFIG_DIR, 'hyper-cache.json');
const HYPER_UPDATE_SCRIPT = path.join(HOME, '.claude', 'hyper-update.js');

// ── Default config ───────────────────────────────────────────
const DEFAULTS = {
  line1: 'git,model+effort,chum',
  line2: 'tokens+cost',
  line3: 'hyper,5h,7d,ctx',
  section_sep: ' | ',
  item_sep: ' · ',
  git_show: 'branch+dirty',
  ctx_warn: '70',
  ctx_crit: '80',
  rate_warn: '80',
  rate_crit: '90',
  hyper_timeout_ms: '2000',
  bar_width: '8',
  bar_filled: '█',
  bar_empty: '░',
  line_spacing: '0', // number of blank lines between lines
};

// ── Simple TOML parser ───────────────────────────────────────
function parseToml(text) {
  const config = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines, comments, and section headers
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Strip trailing comment (only for unquoted values)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf('#');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }
    config[key] = value;
  }
  return config;
}

// ── Read config ──────────────────────────────────────────────
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULTS, ...parseToml(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

// ── Read JSON from stdin ─────────────────────────────────────
function readStdin() {
  try {
    // Use file descriptor 0 (stdin) — works on both Unix and Windows
    const input = fs.readFileSync(0, 'utf-8').trim();
    if (!input || !input.startsWith('{')) return null;
    return JSON.parse(input);
  } catch {
    return null;
  }
}

// ── Read git branch from .git/HEAD ────────────────────────────
function readGitBranch(cwd) {
  try {
    let gitDir = path.join(cwd, '.git');
    // Check if .git is a file (worktree)
    let stat;
    try { stat = fs.statSync(gitDir); } catch { return null; }
    if (stat.isFile()) {
      // It's a gitdir file — read the actual git dir path
      const gitdirContent = fs.readFileSync(gitDir, 'utf-8').trim();
      const match = gitdirContent.match(/^gitdir:\s*(.+)$/);
      if (match) {
        let actualDir = match[1].trim();
        if (!path.isAbsolute(actualDir)) {
          actualDir = path.resolve(cwd, actualDir);
        }
        gitDir = actualDir;
      }
    }
    const headFile = path.join(gitDir, 'HEAD');
    const head = fs.readFileSync(headFile, 'utf-8').trim();
    const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (refMatch) return refMatch[1];
    // Detached HEAD
    if (/^[0-9a-f]{40}$/i.test(head)) return head.slice(0, 7);
    return null;
  } catch {
    return null;
  }
}

// ── Read chum jetsam files ──────────────────────────────────
function findChumSession(sessionId, cwd) {
  if (!sessionId) return null;

  const dirs = [];
  // Local chum dir
  const localChum = path.join(cwd, 'chum');
  dirs.push({ dir: localChum, label: 'local' });
  // Global chum dir
  const globalChum = path.join(HOME, '.config', 'chum', 'jetsam');
  dirs.push({ dir: globalChum, label: 'global' });

  let best = null;
  let bestTime = 0;

  for (const { dir, label } of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const entry of entries) {
      if (!entry.startsWith('jetsam_')) continue;
      const filepath = path.join(dir, entry);
      let fileStat;
      try { fileStat = fs.statSync(filepath); } catch { continue; }
      if (!fileStat.isFile()) continue;
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        // Check if this jetsam contains the session_id
        // JSONL format: first line is header
        // YAML format: session_id: <uuid>
        if (content.includes(sessionId)) {
          if (fileStat.mtimeMs > bestTime) {
            bestTime = fileStat.mtimeMs;
            best = { label, mtime: fileStat.mtimeMs };
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }
  return best;
}

// ── Format relative time ─────────────────────────────────────
function relativeTime(mtimeMs) {
  const diff = Date.now() - mtimeMs;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ── Format tokens ────────────────────────────────────────────
function formatTokens(n) {
  if (n == null) return null;
  const k = n / 1000;
  if (k >= 100) return `${Math.round(k)}k`;
  return `${k.toFixed(1)}k`;
}

// ── Format cost ──────────────────────────────────────────────
function formatCost(cost) {
  if (cost == null) return null;
  return `$${Number(cost).toFixed(2)}`;
}

// ── Render bar ───────────────────────────────────────────────
function renderBar(pct, width, filled, empty) {
  if (pct == null) return null;
  const pctInt = Math.round(Number(pct));
  const filledCount = Math.min(Math.max(Math.round(pctInt * width / 100), 0), width);
  const emptyCount = width - filledCount;
  return filled.repeat(filledCount) + empty.repeat(emptyCount);
}

// ── Color helpers ────────────────────────────────────────────
function colorForCtx(pct, warn, crit) {
  const n = Number(pct);
  if (n >= crit) return C.RED;
  if (n >= warn) return C.ORANGE;
  return C.GREEN;
}

function colorForRate(pct, warn, crit) {
  const n = Number(pct);
  if (n >= crit) return C.RED;
  if (n >= warn) return C.ORANGE;
  return C.GREEN;
}

// ── Segment renderers ────────────────────────────────────────

function renderGit(data, config, cwd) {
  const branch = readGitBranch(cwd);
  
  // Helper to format path with ~ for home directory
  const formatPath = (dir) => {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (dir.startsWith(home)) {
      return '~' + dir.slice(home.length);
    }
    return dir;
  };
  
  // Get repo name (parent directory of git root)
  let repoName = '';
  if (branch) {
    try {
      const gitTimeout = parseInt(config.git_timeout_ms || 500, 10);
      const gitRoot = require('child_process').execSync('git rev-parse --show-toplevel', {
        cwd,
        timeout: gitTimeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      repoName = require('path').basename(gitRoot);
    } catch {
      // git rev-parse failed (dubious ownership, not a repo, etc.)
      // Fallback: use current directory name
      repoName = require('path').basename(cwd);
    }
  }

  // If no branch, show the formatted path
  if (!branch) {
    return formatPath(cwd);
  }

  let result = `⌥ ${repoName ? `${repoName}${branch === 'main' ? ':' : ' 🌿 '}${branch}` : branch}`;

  // Worktree suffix
  if (data.workspace && data.workspace.git_worktree) {
    result += `/${data.workspace.git_worktree}`;
  }

  // Dirty detection (only in branch+dirty mode)
  if (config.git_show === 'branch+dirty') {
    try {
      const statusTimeout = parseInt(config.git_status_timeout_ms || 500, 10);
      const status = require('child_process').execSync('git status --porcelain', {
        cwd,
        timeout: statusTimeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const lines = status.trim().split('\n').filter(Boolean);
      let staged = 0, modified = 0;
      for (const line of lines) {
        const s = line.slice(0, 2);
        if (s[0] !== ' ' && s[0] !== '?') staged++;
        if (s[1] !== ' ' && s[1] !== '?') modified++;
      }
      if (staged > 0 && modified > 0) result += '+*';
      else if (staged > 0) result += '+';
      else if (modified > 0) result += '*';
    } catch {
      // timeout or error — show branch only
    }
  }

  return result;
}

function renderModelEffort(data) {
  const model = data.model && data.model.display_name;
  const effort = data.effort && data.effort.level;
  if (!model && !effort) return `${C.DIM}---${C.RESET}`;
  if (model && effort) return `${model} · ${effort}`;
  return model || effort;
}

function renderTokensCost(data) {
  const input = data.context_window && data.context_window.total_input_tokens;
  const output = data.context_window && data.context_window.total_output_tokens;
  const cost = data.cost && data.cost.total_cost_usd;
  const currentUsage = data.context_window && data.context_window.current_usage;
  const cacheRead = currentUsage && currentUsage.cache_read_input_tokens;
  const cacheWrite = currentUsage && currentUsage.cache_creation_input_tokens;

  if (!input && !output && cost == null) return `${C.DIM}---${C.RESET}`;

  const parts = [];
  if (input || output) {
    const inStr = formatTokens(input) || '?';
    const outStr = formatTokens(output) || '?';
    parts.push(`↑${inStr} ↓${outStr}`);
  }
  if (currentUsage) {
    const cacheParts = [];
    if (cacheWrite != null && cacheWrite > 0) {
      cacheParts.push(`W:${formatTokens(cacheWrite)}`);
    }
    if (cacheRead != null && cacheRead > 0) {
      cacheParts.push(`R:${formatTokens(cacheRead)}`);
    }
    if (cacheParts.length > 0 && input > 0) {
      const cacheRate = Math.round(((cacheRead || 0) / input) * 100);
      parts.push(`⚡${cacheParts.join(' ')}(${cacheRate}%)`);
    }
  }
  if (cost != null) {
    parts.push(formatCost(cost));
  }
  return parts.join(' · ');
}

function renderChum(data, cwd) {
  const sessionId = data.session_id;
  if (!sessionId) return `${C.DIM}---${C.RESET}`;

  const found = findChumSession(sessionId, cwd);
  if (!found) return `chum ${C.RED}✘${C.RESET}`;

  const rel = relativeTime(found.mtime);
  return `chum ${C.GREEN}✔ ${rel}${C.RESET}`;
}

function renderHyper(config) {
  try {
    const cache = JSON.parse(fs.readFileSync(HYPER_CACHE_FILE, 'utf-8'));
    if (cache && cache.balance != null) {
      const dailyLimit = parseInt(config.hyper_daily_limit || 250, 10);
      const used = dailyLimit - cache.balance;
      const pct = (used / dailyLimit) * 100;
      
      // Calculate time until refresh (22:06 UTC+1 = 21:06 UTC)
      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      const targetHour = 21; // 22:06 UTC+1 = 21:06 UTC
      const targetMinute = 6;
      
      let hoursUntil = targetHour - utcHours;
      let minutesUntil = targetMinute - utcMinutes;
      
      if (minutesUntil < 0) {
        hoursUntil--;
        minutesUntil += 60;
      }
      if (hoursUntil < 0) {
        hoursUntil += 24;
      }
      
      const refreshStr = `${hoursUntil}h${minutesUntil}m`;
      
      // Apply color based on percentage used
      const warn = parseInt(config.hyper_warn || 80, 10);
      const crit = parseInt(config.hyper_crit || 90, 10);
      
      let color = C.GREEN;
      if (pct >= crit) color = C.RED;
      else if (pct >= warn) color = C.ORANGE;
      
      return `${color}${C.HYPER_GEM} ${cache.balance} hc ${refreshStr}${C.RESET}`;
    }
  } catch {
    // cache missing or unreadable
  }
  return `${C.DIM}${C.HYPER_GEM} ---${C.RESET}`;
}

function renderCtx(data, config) {
  const pct = data.context_window && data.context_window.used_percentage;
  if (pct == null) return `${C.DIM}ctx ---${C.RESET}`;

  const warn = Number(config.ctx_warn);
  const crit = Number(config.ctx_crit);
  const bar = renderBar(pct, Number(config.bar_width), config.bar_filled, config.bar_empty);
  const color = colorForCtx(pct, warn, crit);
  return `${color}ctx ${bar} ${Math.round(Number(pct))}%${C.RESET}`;
}

function timeUntil(resetsAt) {
  if (resetsAt == null) return null;
  const diff = Math.floor(Number(resetsAt) - Date.now() / 1000);
  if (diff <= 0) return `${C.GREEN}now${C.RESET}`;
  const hTotal = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (hTotal >= 24) {
    const d = Math.floor(hTotal / 24);
    const h = hTotal % 24;
    return `${C.CYAN}${d}d ${h}h${C.RESET}`;
  }
  if (hTotal > 0) return `${C.CYAN}${hTotal}h ${m}m${C.RESET}`;
  return `${C.CYAN}${m}m${C.RESET}`;
}

function renderRateLimit(label, pct, resetsAt, config) {
  if (pct == null) return `${C.DIM}${label} ---${C.RESET}`;

  const warn = Number(config.rate_warn);
  const crit = Number(config.rate_crit);
  const bar = renderBar(pct, Number(config.bar_width), config.bar_filled, config.bar_empty);
  const color = colorForRate(pct, warn, crit);
  const reset = timeUntil(resetsAt);
  const resetStr = reset ? ` ${reset}` : '';
  return `${color}${label} ${bar} ${Math.round(Number(pct))}%${resetStr}${C.RESET}`;
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  const data = readStdin();
  if (!data) {
    console.log(`${C.DIM}Waiting for session...${C.RESET}`);
    return;
  }

  const config = readConfig();
  const cwd = (data.workspace && data.workspace.current_dir) || process.cwd();

// ── Segment registry ─────────────────────────────────────────
const SEGMENTS = {
  'git': (data, config, cwd) => renderGit(data, config, cwd),
  'model+effort': (data) => renderModelEffort(data),
  'tokens+cost': (data) => renderTokensCost(data),
  'chum': (data, config, cwd) => renderChum(data, cwd),
  'hyper': (data, config) => renderHyper(config),
  'ctx': (data, config) => renderCtx(data, config),
  '5h': (data, config) => {
    const rl = data.rate_limits && data.rate_limits.five_hour;
    return renderRateLimit('5h', rl && rl.used_percentage, rl && rl.resets_at, config);
  },
  '7d': (data, config) => {
    const rl = data.rate_limits && data.rate_limits.seven_day;
    return renderRateLimit('7d', rl && rl.used_percentage, rl && rl.resets_at, config);
  },
};

// ── Render a line from config ────────────────────────────────
function renderLine(lineConfig, data, config, cwd) {
  const segments = lineConfig.split(',').map(s => s.trim());
  const parts = [];
  for (const seg of segments) {
    const renderer = SEGMENTS[seg];
    if (renderer) {
      parts.push(renderer(data, config, cwd));
    }
  }
  return parts.join(config.section_sep || DEFAULTS.section_sep);
}

  // ── Sync refresh interval to settings.json ─────────────────
  const refreshInterval = parseInt(config.refresh_interval_s || 300, 10);
  const settingsPath = path.join(HOME, '.claude', 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (settings.statusLine && settings.statusLine.refreshInterval !== refreshInterval) {
      settings.statusLine.refreshInterval = refreshInterval;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    }
  } catch {
    // settings.json missing or invalid — not critical
  }

  // ── Render lines ─────────────────────────────────────────
  const sep = config.section_sep || DEFAULTS.section_sep;
  const line1 = renderLine(config.line1 || DEFAULTS.line1, data, config, cwd);
  const line2 = renderLine(config.line2 || DEFAULTS.line2, data, config, cwd);
  const line3 = renderLine(config.line3 || DEFAULTS.line3, data, config, cwd);

  console.log(line1);
  
  // Add vertical spacing between lines
  const spacing = parseInt(config.line_spacing || DEFAULTS.line_spacing, 10);
  for (let i = 0; i < spacing; i++) {
    console.log('');
  }
  
  console.log(line2);
  
  for (let i = 0; i < spacing; i++) {
    console.log('');
  }
  
  console.log(line3);

  // ── Spawn background Hyper update ────────────────────────
  try {
    const child = spawn(process.execPath, [HYPER_UPDATE_SCRIPT], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // Background process failed to spawn — not critical
  }
}

main();