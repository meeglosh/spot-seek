#!/usr/bin/env node
/**
 * Run the backend test suite against an ephemeral Neon branch.
 *
 * Creates a copy-on-write child of the dev branch, points DATABASE_URL at it,
 * runs vitest with whatever args were passed through, and deletes the branch
 * again (also on Ctrl-C and on failure). The suite therefore starts from the
 * dev branch's current data and leaves no fixtures behind, and parallel runs
 * cannot step on each other.
 *
 * When NEON_API_KEY is missing or TEST_DB_BRANCH=0 is set, the only fallback is
 * the shared dev DB, which is the LIVE production database. That now fails
 * closed: it refuses unless SPOTSEEK_ALLOW_LIVE_DB_TESTS=1 is set.
 *
 * Needs in env or backend/.dev.vars: NEON_API_KEY, DATABASE_URL (for the role,
 * database name and query params; the host is replaced by the branch's).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROJECT_ID = process.env.NEON_PROJECT_ID ?? 'muddy-hall-40509626';
const PARENT_BRANCH_ID = process.env.NEON_PARENT_BRANCH_ID ?? 'br-dark-term-att297p4'; // live branch, named "production" since 2026-10-18
const API = 'https://console.neon.tech/api/v2';
const backendDir = dirname(dirname(fileURLToPath(import.meta.url)));

function devVars() {
  const out = {};
  try {
    for (const line of readFileSync(join(backendDir, '.dev.vars'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // no file: env only
  }
  return out;
}

const vars = { ...devVars(), ...process.env };
const vitestArgs = process.argv.slice(2);

function runVitest(env) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['vitest', ...vitestArgs], { stdio: 'inherit', env, cwd: backendDir });
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on('error', () => resolve(1));
  });
}

// Additive, idempotent scripts (backend/scripts) applied to the ephemeral branch before vitest.
// Add a script here when a feature needs schema the live DB does not have yet; drop it once the
// owner has run it on live (see BLOCKED.md).
const BRANCH_MIGRATIONS = ['scripts/add-type-prefs.ts'];

function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit', env, cwd: backendDir });
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on('error', () => resolve(1));
  });
}

async function neonFetch(apiKey, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Neon API ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function waitForOperations(apiKey, operations) {
  for (const op of operations ?? []) {
    for (let i = 0; i < 60; i++) {
      const { operation } = await neonFetch(apiKey, 'GET', `/projects/${PROJECT_ID}/operations/${op.id}`);
      if (operation.status === 'finished') break;
      if (operation.status === 'failed' || operation.status === 'error')
        throw new Error(`Neon operation ${operation.action} ${operation.status}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function branchUrl(templateUrl, host) {
  const u = new URL(templateUrl);
  u.host = host;
  return u.toString();
}

async function main() {
  const apiKey = vars.NEON_API_KEY;
  if (!apiKey || process.env.TEST_DB_BRANCH === '0') {
    if (process.env.SPOTSEEK_ALLOW_LIVE_DB_TESTS !== '1') {
      console.error(
        '[test-branch] REFUSING to run: no NEON_API_KEY (or TEST_DB_BRANCH=0), so the suite would fall back to the\n' +
          'SHARED dev DB, which is the LIVE production database behind spotseek.app. Tests write fixtures to it\n' +
          'and some specs create triggers on live tables.\n' +
          'Fix: set NEON_API_KEY (env or backend/.dev.vars) so the suite runs on an ephemeral Neon branch.\n' +
          'Only if you really mean to hit live data: SPOTSEEK_ALLOW_LIVE_DB_TESTS=1.',
      );
      process.exit(1);
    }
    console.warn('[test-branch] SPOTSEEK_ALLOW_LIVE_DB_TESTS=1: running against the SHARED dev DB (LIVE production data)');
    process.exit(await runVitest(process.env));
  }
  if (!vars.DATABASE_URL) throw new Error('[test-branch] DATABASE_URL not found in env or backend/.dev.vars');

  const name = `test-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  console.log(`[test-branch] creating Neon branch ${name} from ${PARENT_BRANCH_ID}`);
  const created = await neonFetch(apiKey, 'POST', `/projects/${PROJECT_ID}/branches`, {
    branch: { parent_id: PARENT_BRANCH_ID, name },
    endpoints: [{ type: 'read_write', autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 1, suspend_timeout_seconds: 0 }],
  });
  const branchId = created.branch.id;
  const endpoint = created.endpoints?.[0];
  if (!endpoint) throw new Error('[test-branch] branch created without an endpoint');

  let deleted = false;
  const cleanup = async () => {
    if (deleted) return;
    deleted = true;
    try {
      await neonFetch(apiKey, 'DELETE', `/projects/${PROJECT_ID}/branches/${branchId}`);
      console.log(`[test-branch] deleted Neon branch ${name}`);
    } catch (err) {
      console.error(`[test-branch] FAILED to delete branch ${name} (${branchId}); delete it by hand:`, err);
    }
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, async () => {
      await cleanup();
      process.exit(130);
    });
  }

  let code = 1;
  try {
    await waitForOperations(apiKey, created.operations);
    // Pooled host for the app code (what the Worker uses); the direct host is
    // the same name without "-pooler".
    const pooledHost = endpoint.host.replace(/^([^.]+)\./, '$1-pooler.');
    const env = {
      ...process.env,
      DATABASE_URL: branchUrl(vars.DATABASE_URL, pooledHost),
      DATABASE_URL_UNPOOLED: branchUrl(vars.DATABASE_URL_UNPOOLED ?? vars.DATABASE_URL, endpoint.host),
      SPOTSEEK_TEST_DB_BRANCH: branchId,
    };
    // The branch is cut from the live DB, which lacks additive columns/tables until the owner
    // runs their scripts there. Apply the pending ones to THIS ephemeral branch only (env points
    // at the branch; the scripts are idempotent ADD ... IF NOT EXISTS).
    for (const script of BRANCH_MIGRATIONS) {
      if ((await runScript(script, env)) !== 0) throw new Error(`[test-branch] migration ${script} failed on the test branch`);
    }
    console.log(`[test-branch] branch ready (${endpoint.host}); running vitest`);
    code = await runVitest(env);
  } finally {
    await cleanup();
  }
  process.exit(code);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
