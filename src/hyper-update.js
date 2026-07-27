#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────
//  hyper-update.js  —  Background Hyper credit balance updater
//
//  Fetches Hyper API balance and writes to cache file.
//  Designed to run detached — never writes to stdout/stderr.
//  Silently handles all errors (network, timeout, parse, config).
// ──────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const HOME = process.env.HOME || process.env.USERPROFILE || '';
const CONFIG_DIR = path.join(HOME, '.claude', 'dash');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.toml');
const CACHE_FILE = path.join(CONFIG_DIR, 'hyper-cache.json');

const HYPER_URL = 'https://hyper.charm.land';
const API_PATH = '/v1/credits';

// ── Simple TOML parser (same as main script) ─────────────────
function parseToml(text) {
  const config = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
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
    return parseToml(raw);
  } catch {
    return {};
  }
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  // Read API key from env
  const apiKey = process.env.HYPER_API_KEY;
  if (!apiKey) {
    // No API key — exit silently, cache unchanged
    return;
  }

  const config = readConfig();
  const timeoutMs = parseInt(config.hyper_timeout_ms || '2000', 10);

  // Try to parse the URL to get hostname
  const url = new URL(HYPER_URL);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: API_PATH,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: controller.signal,
  };

  const req = transport.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.balance === 'number') {
          const cache = {
            balance: parsed.balance,
            timestamp: Date.now(),
          };
          // Ensure config dir exists
          try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch {}
          fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
        }
      } catch {
        // Parse error — exit silently
      }
    });
  });

  req.on('error', () => {
    clearTimeout(timeout);
    // Network error — exit silently
  });

  req.on('timeout', () => {
    clearTimeout(timeout);
    req.destroy();
    // Timeout — exit silently
  });

  req.end();
}

main();