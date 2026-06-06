import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getHeader, sha256, syncBotMetadata, getRuntimeEnv, sendMarkdownMessage, readFirstBytes } from '../../lib/framework/utils.js';
import { parseWebhookQuery, buildWebhookUrl, buildAllowedUpdates } from '../../lib/framework/settings.js';
import { buildReplyRequest } from '../../lib/framework/reply.js';
import { makeWebhookSetupHandler } from '../../lib/framework/setup.js';
import { installMockFetch, restoreFetch, recordedCalls } from '../whitebox_helper.mjs';

describe('Framework unit_utils', () => {
  beforeEach(() => { recordedCalls.length = 0; });
  afterEach(() => restoreFetch());

  test('getHeader() — case-insensitive lookup', () => {
    const h = { 'Content-Type': 'application/json', 'X-Custom': 'VALUE' };
    assert.equal(getHeader(h, 'content-type'), 'application/json', 'lowercase lookup must work');
    assert.equal(getHeader(h, 'CONTENT-TYPE'), 'application/json', 'UPPERCASE lookup must work');
    assert.equal(getHeader(h, 'x-custom'), 'VALUE', 'mixed-case lookup must work');
    assert.equal(getHeader(h, 'x-missing'), null, 'missing key must return null');
    assert.equal(getHeader(null, 'x-foo'), null, 'null headers must return null');
    assert.equal(getHeader(undefined, 'x-foo'), null, 'undefined headers must return null');
    assert.equal(getHeader({}, 'x-foo'), null, 'empty headers must return null');
    assert.equal(getHeader('not-an-object', 'content-type'), null, 'non-object headers must return null');
  });

  test('sha256()', async () => {
    const h = await sha256('abc');
    assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256("abc") must produce known digest');

    const empty = await sha256('');
    assert.equal(empty, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'sha256("") must produce known digest');

    const unicodeHash = await sha256('Привет, мир! 🌍');
    assert.equal(typeof unicodeHash, 'string', 'SHA-256 hash must be a string');
    assert.equal(unicodeHash.length, 64, 'SHA-256 hash must be 64 characters long');

    const repeat1 = await sha256('hello world');
    const repeat2 = await sha256('hello world');
    assert.equal(repeat1, repeat2, 'sha256 must be deterministic');
  });

  test('syncBotMetadata()', async () => {
    installMockFetch();

    await syncBotMetadata('mock_token', 'ru', 'Имя', 'Описание', 'Короткое описание');

    const nameCall = recordedCalls.find(c => c.url.includes('/setMyName'));
    assert.ok(nameCall, 'setMyName should be called');
    assert.equal(nameCall.json.name, 'Имя');
    assert.equal(nameCall.json.language_code, 'ru');

    const descCall = recordedCalls.find(c => c.url.includes('/setMyDescription'));
    assert.ok(descCall, 'setMyDescription should be called');
    assert.equal(descCall.json.description, 'Описание');
    assert.equal(descCall.json.language_code, 'ru');

    const shortCall = recordedCalls.find(c => c.url.includes('/setMyShortDescription'));
    assert.ok(shortCall, 'setMyShortDescription should be called');
    assert.equal(shortCall.json.short_description, 'Короткое описание');
    assert.equal(shortCall.json.language_code, 'ru');
  });

  test('getRuntimeEnv()', async () => {
    const customEnv = { TEST_VAR: 'custom_value' };
    assert.equal(getRuntimeEnv('TEST_VAR', customEnv), 'custom_value');

    const prevVal = process.env.TEST_VAR;
    process.env.TEST_VAR = 'global_value';
    try {
      assert.equal(getRuntimeEnv('TEST_VAR', customEnv), 'custom_value', 'Custom env must override process.env');
      assert.equal(getRuntimeEnv('TEST_VAR', {}), 'global_value', 'Should fall back to process.env');
    } finally {
      if (prevVal === undefined) {
        delete process.env.TEST_VAR;
      } else {
        process.env.TEST_VAR = prevVal;
      }
    }

    const prevVal2 = process.env.TEST_VAR_2;
    process.env.TEST_VAR_2 = 'global_value_2';
    try {
      assert.equal(getRuntimeEnv('TEST_VAR_2'), 'global_value_2', 'Should read from process.env when envObj is omitted');
      assert.equal(getRuntimeEnv('TEST_VAR_2', null), 'global_value_2', 'Should read from process.env when envObj is null');
    } finally {
      if (prevVal2 === undefined) {
        delete process.env.TEST_VAR_2;
      } else {
        process.env.TEST_VAR_2 = prevVal2;
      }
    }

    assert.equal(getRuntimeEnv('TOTALLY_MISSING_VAR_XYZ'), undefined);
  });

  test('sendMarkdownMessage()', async () => {
    installMockFetch();

    await sendMarkdownMessage('mock_token', 12345, '*hello*', {
      replyToMessageId: 77,
      businessConnectionId: 'bc_123'
    });

    const call = recordedCalls.find(c => c.url.includes('/sendMessage'));
    assert.ok(call, 'sendMessage should be called');
    assert.equal(call.json.chat_id, 12345);
    assert.equal(call.json.reply_to_message_id, 77);
    assert.equal(call.json.business_connection_id, 'bc_123');
    assert.equal(call.json.parse_mode, 'MarkdownV2');
  });

  test('readFirstBytes()', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6]).buffer
    });
    try {
      const bytes = await readFirstBytes('https://example.com/audio.bin', 4, 1000);
      assert.deepEqual(Array.from(bytes), [1, 2, 3, 4]);
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  test('Generic webhook settings helpers', () => {
    const query = parseWebhookQuery({ url: 'https://bot.example.com/api/webhook?lang=de&verbose=on&owner=42' });
    assert.equal(query.lang, 'de');
    assert.equal(query.verbose, 'on');
    assert.equal(query.owner, '42');

    const url = buildWebhookUrl('https://bot.example.com/', '/api/webhook', {
      lang: 'de',
      verbose: 'on'
    });
    assert.equal(url, 'https://bot.example.com/api/webhook?lang=de&verbose=on');

    const updates = buildAllowedUpdates(['message'], [
      { enabled: true, updates: ['guest_message'] },
      { enabled: true, updates: ['message', 'business_message'] }
    ]);
    assert.deepEqual(updates, ['message', 'guest_message', 'business_message']);
  });

  test('Reply request builder', () => {
    const baseUpdate = {};
    const baseMessage = {
      message_id: 42,
      chat: { id: 777 }
    };

    const normalReply = buildReplyRequest(baseUpdate, baseMessage, 'hello', undefined);
    assert.equal(normalReply.method, 'sendMessage');
    assert.equal(normalReply.payload.chat_id, 777);
    assert.equal(normalReply.payload.reply_to_message_id, 42);

    const guestReply = buildReplyRequest(
      { guest_message: { guest_query_id: 'gq_123' } },
      { ...baseMessage, guest_query_id: 'gq_123' },
      'hello guest',
      null
    );
    assert.equal(guestReply.method, 'answerGuestQuery');
    assert.equal(guestReply.payload.guest_query_id, 'gq_123');
    assert.equal(guestReply.payload.result.input_message_content.message_text, 'hello guest');
  });

  test('Webhook setup handler factory', async () => {
    installMockFetch();

    let afterSetupCalled = false;
    const handler = makeWebhookSetupHandler({
      parseWebhookConfig: () => ({ owner: '11', verbose: true }),
      buildWebhookSetup: (baseUrl, _token, settings, secret) => ({
        url: `${baseUrl}/api/webhook?owner=${settings.owner}`,
        secret_token: secret,
        allowed_updates: ['message']
      }),
      getDefaultSettings: () => ({ owner: '', verbose: false }),
      onAfterSetup: async () => { afterSetupCalled = true; }
    });

    const res = await handler({
      headers: { host: 'example.com', 'x-forwarded-proto': 'https' },
      query: { token: 'mock_token' },
      body: {}
    }, {
      telegramBotToken: 'mock_token'
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(afterSetupCalled, true);

    const getWebhookCall = recordedCalls.find(c => c.url.includes('/getWebhookInfo'));
    const setWebhookCall = recordedCalls.find(c => c.url.includes('/setWebhook'));
    assert.ok(getWebhookCall, 'getWebhookInfo should be called');
    assert.ok(setWebhookCall, 'setWebhook should be called');
  });
});
