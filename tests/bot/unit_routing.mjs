import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handleSetup } from '../../lib/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { handleDashboard } from '../../lib/dashboard.js';
import { setupBotProfile, setupBotAvatar, handleCommand } from '../../lib/commands.js';
import { spawnSync } from 'node:child_process';
import {
  recordedCalls,
  installMockFetch,
  restoreFetch,
  mkJson,
  MOCK_TOKEN,
  MOCK_CONFIG
} from '../whitebox_helper.mjs';

describe('Bot unit_routing', () => {
  beforeEach(() => { recordedCalls.length = 0; });
  afterEach(() => restoreFetch());

  test('Bot Profile & Avatar Setup Automation', async () => {
    installMockFetch();

    await setupBotProfile(MOCK_TOKEN);
    const setCmdCall = recordedCalls.find(c => c.url.includes('/setMyCommands'));
    assert.ok(setCmdCall, 'setMyCommands should be called during profile sync');

    const avatarPath = path.join(process.cwd(), 'avatar.jpg');
    try {
      fs.writeFileSync(avatarPath, 'mock_image');
      recordedCalls.length = 0;
      await setupBotAvatar(MOCK_TOKEN);
      const photoCall = recordedCalls.find(c => c.url.includes('/setMyProfilePhoto'));
      assert.ok(photoCall, 'setMyProfilePhoto should be called during avatar sync');
    } finally {
      if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
    }
  });

  test('handleSetup() API endpoint', async () => {
    installMockFetch();

    const okReq = { query: { token: MOCK_TOKEN }, headers: { host: 'mybot.com', 'x-forwarded-proto': 'https' } };
    const res = await handleSetup(okReq, MOCK_CONFIG);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  test('handleDashboard() landing HTML', async () => {
    installMockFetch({
      '/getMe': () => mkJson({ ok: true, result: { username: 'testbot' } })
    });

    const res = await handleDashboard({ headers: { host: 'mybot.com' } }, MOCK_CONFIG);
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('<!DOCTYPE html>'));
  });

  test('Cloudflare entrypoint serves dashboard at root', async () => {
    const runnerPath = path.join(__dirname, 'cf_worker_runner.mjs');
    const isDeno = typeof Deno !== 'undefined' || !!process.versions?.deno;
    const args = isDeno ? ['run', '--allow-read', '--allow-write', '--allow-env', runnerPath] : [runnerPath];
    const child = spawnSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    assert.equal(child.status, 0, `Child process should succeed.\nSTDOUT:\n${child.stdout}\nSTDERR:\n${child.stderr}`);
    const resultLine = child.stdout.split(/\r?\n/).find(line => line.startsWith('__RESULT__'));
    assert.ok(resultLine, `Expected child process to print result marker.\nSTDOUT:\n${child.stdout}`);

    const result = JSON.parse(resultLine.slice('__RESULT__'.length));
    assert.equal(result.status, 200, `Expected root route to return 200, got ${result.status}. Body: ${result.bodyStart}`);
    assert.ok(result.bodyStart.includes('<!DOCTYPE html>'), 'Expected root route to render dashboard HTML');
  });

  test('Settings Commands & Callbacks — /help sends message', async () => {
    installMockFetch({
      '/sendMessage': () => mkJson({ ok: true, result: {} })
    });

    recordedCalls.length = 0;
    await handleCommand({
      chat: { id: 99999, type: 'private' },
      from: { id: 99999 },
      text: '/help'
    }, MOCK_CONFIG, 'https://mybot.com');

    const msgCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
    assert.ok(msgCall, 'sendMessage should be called on help command');
    assert.ok(msgCall.json.text.includes('transcription bot'));
  });

  test('/prompt too-long warning validation', async () => {
    installMockFetch({
      '/sendMessage': () => mkJson({ ok: true, result: { message_id: 12345 } }),
      '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://mybot.com/api/webhook?owner=99999' } })
    });

    recordedCalls.length = 0;
    const longPromptText = 'word '.repeat(300);

    await handleCommand({
      message_id: 888,
      chat: { id: 99999, type: 'private' },
      from: { id: 99999 },
      text: `/prompt ${longPromptText}`
    }, MOCK_CONFIG, 'https://mybot.com');

    const msgCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
    assert.ok(msgCall, 'sendMessage should be called to warn the user');
    assert.ok(msgCall.json.text.includes('too long') || msgCall.json.text.includes('длинный'));

    const button = msgCall.json.reply_markup?.inline_keyboard?.[0]?.[0];
    assert.ok(button);
    assert.ok(button.switch_inline_query_current_chat);
    assert.ok(button.switch_inline_query_current_chat.startsWith('/prompt '));
  });
});
