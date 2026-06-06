/**
 * ci_test_github_fork_sync.mjs
 * Category: Quality Assurance / Fork Sync Workflow Test
 *
 * Tests all 5 scenarios of the fork sync workflow by invoking the pure
 * decision script (scripts/ci_github_fork_sync.sh) with pre-computed status
 * variables — no real git repositories are created or needed.
 *
 * Scenarios tested:
 *   1. Already up to date          → exit 0, success message
 *   2. New commits, no divergence  → exit 0, synced message
 *   3. Local commits ahead         → exit 0, warning emitted
 *   4. Histories diverged (FF fail) → exit 1, error emitted
 *   5a. Upstream unreachable       → exit 1, error emitted
 *   5b. Upstream branch not found  → exit 1, error emitted
 *
 * Usage:
 *   node scripts/ci_test_github_fork_sync.mjs
 */

import { spawnSync } from 'child_process';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '../scripts/ci_github_fork_sync.sh');

// ----------------------------------------------------
// Locate bash (cross-platform: Linux/macOS/Git for Windows/WSL)
// ----------------------------------------------------
function findBash() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'bash',
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) && candidate !== 'bash') continue;
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const BASH = findBash();

if (!BASH) {
  console.warn('⚠️  ci_test_github_fork_sync: bash not found on this system. Tests skipped.');
  process.exit(0);
}

// ----------------------------------------------------
// Test Runner Helper
// ----------------------------------------------------
function runLogic(envVars) {
  const baseEnv = typeof Deno !== 'undefined' ? Deno.env.toObject() : process.env;
  const env = { ...baseEnv, ...envVars };
  if (process.env?.PATH && !env.PATH) env.PATH = process.env.PATH;
  if (process.env?.Path && !env.Path) env.Path = process.env.Path;
  if (process.env?.SystemRoot && !env.SystemRoot) env.SystemRoot = process.env.SystemRoot;

  const scriptPath = SCRIPT.replace(/\\/g, '/');
  const child = spawnSync(BASH, [scriptPath], {
    env,
    encoding: 'utf8'
  });
  return { exitCode: child.status, stdout: child.stdout || '', stderr: child.stderr || '' };
}

// ----------------------------------------------------
// Already up to date
// ----------------------------------------------------
function testScenario1_AlreadyUpToDate() {
  console.log('\n--- Already up to date ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '0', AHEAD: '0', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 0, 'Should exit 0');
  assert.ok(stdout.includes('Already up to date'), 'Should print up-to-date message');
  console.log('✅ Passed: exits 0, prints up-to-date message');
}

// ----------------------------------------------------
// New commits, no divergence → FF merge succeeds
// ----------------------------------------------------
function testScenario2_FastForwardSuccess() {
  console.log('\n--- Fast-forward merge success ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '3', AHEAD: '0', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 0, 'Should exit 0');
  assert.ok(stdout.includes('successfully synced'), 'Should print sync success message');
  assert.ok(stdout.includes('3 commit(s)'), 'Should mention commit count');
  console.log('✅ Passed: exits 0, prints sync success');
}

// ----------------------------------------------------
// Local commits ahead → skipped with warning
// ----------------------------------------------------
function testScenario3_LocalAhead() {
  console.log('\n--- Local commits ahead of upstream ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '2', AHEAD: '4', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 0, 'Should exit 0 (warning, not error)');
  assert.ok(stdout.includes('::warning::'), 'Should emit a GitHub Actions warning annotation');
  assert.ok(stdout.includes('4 local commit(s)'), 'Should mention local commit count');
  assert.ok(!stdout.includes('::error::'), 'Should NOT emit an error');
  console.log('✅ Passed: exits 0, emits ::warning:: annotation');
}

// ----------------------------------------------------
// Histories diverged, FF impossible
// ----------------------------------------------------
function testScenario4_Diverged() {
  console.log('\n--- Histories diverged (FF impossible) ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '1', BEHIND: '5', AHEAD: '0', MERGE_OK: '0'
  });
  assert.strictEqual(exitCode, 1, 'Should exit 1');
  assert.ok(stdout.includes('::error::'), 'Should emit a GitHub Actions error annotation');
  assert.ok(stdout.includes('diverged'), 'Should mention diverged history');
  assert.ok(stdout.includes('rebase'), 'Should mention rebase as resolution step');
  console.log('✅ Passed: exits 1, emits ::error:: with rebase instructions');
}

// ----------------------------------------------------
// Upstream fetch failed
// ----------------------------------------------------
function testScenario5a_FetchFailed() {
  console.log('\n--- Upstream unreachable ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '0', BRANCH_OK: '1', BEHIND: '0', AHEAD: '0', MERGE_OK: '1'
  });
  assert.strictEqual(exitCode, 1, 'Should exit 1');
  assert.ok(stdout.includes('::error::'), 'Should emit a GitHub Actions error annotation');
  assert.ok(stdout.includes('Could not fetch'), 'Should mention fetch failure');
  console.log('✅ Passed: exits 1, emits ::error:: for unreachable upstream');
}

// ----------------------------------------------------
// Upstream branch not found
// ----------------------------------------------------
function testScenario5b_BranchMissing() {
  console.log('\n--- Upstream branch not found ---');
  const { exitCode, stdout } = runLogic({
    FETCH_OK: '1', BRANCH_OK: '0', BEHIND: '0', AHEAD: '0', MERGE_OK: '1',
    DEFAULT_BRANCH: 'main'
  });
  assert.strictEqual(exitCode, 1, 'Should exit 1');
  assert.ok(stdout.includes('::error::'), 'Should emit a GitHub Actions error annotation');
  assert.ok(stdout.includes("'main' was not found"), 'Should mention missing branch name');
  console.log('✅ Passed: exits 1, emits ::error:: for missing upstream branch');
}

// ----------------------------------------------------
// Workflow Guard: fork-only condition in sync.yml
// ----------------------------------------------------
function testWorkflowForkGuard() {
  console.log('\n--- Workflow Guard: fork-only condition ---');
  const syncYmlPath = path.join(__dirname, '..', '.github', 'workflows', 'sync.yml');
  assert.ok(fs.existsSync(syncYmlPath), 'sync.yml must exist');
  const content = fs.readFileSync(syncYmlPath, 'utf8');
  assert.ok(
    content.includes('github.event.repository.fork'),
    'sync.yml must include a fork guard (if: github.event.repository.fork) to prevent running in the upstream repo'
  );
  console.log('✅ Workflow guard passed: sync.yml contains fork-only condition');
}

import { describe, test } from 'node:test';

describe('Fork Sync Workflows', () => {
  test('Already up to date', () => { testScenario1_AlreadyUpToDate(); });
  test('Fast-forward merge success', () => { testScenario2_FastForwardSuccess(); });
  test('Local commits ahead of upstream', () => { testScenario3_LocalAhead(); });
  test('Histories diverged (FF impossible)', () => { testScenario4_Diverged(); });
  test('Upstream unreachable', () => { testScenario5a_FetchFailed(); });
  test('Upstream branch not found', () => { testScenario5b_BranchMissing(); });
  test('Workflow Guard: fork-only condition in sync.yml', () => { testWorkflowForkGuard(); });
});
