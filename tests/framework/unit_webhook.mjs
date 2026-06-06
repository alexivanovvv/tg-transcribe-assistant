import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureWebhookFramework,
  registerUpdateHandler,
  verifyWebhookSecret,
  handleWebhook,
  clearDeduplicationCache,
  hasBotMention,
  isMessageDirectedToBot,
  clearBotInfoCache
} from '../../lib/framework/webhook.js';
import { setDebugOwnerId } from '../../lib/framework/utils.js';
import { MOCK_TOKEN, MOCK_SECRET, installMockFetch, restoreFetch } from '../whitebox_helper.mjs';

describe('Framework unit_webhook', () => {
  afterEach(() => {
    restoreFetch();
    clearBotInfoCache();
  });

  test('Webhook secret verification', async () => {
    const valid = await verifyWebhookSecret({ 'x-telegram-bot-api-secret-token': MOCK_SECRET }, MOCK_TOKEN);
    assert.equal(valid, true);

    const invalid = await verifyWebhookSecret({ 'x-telegram-bot-api-secret-token': 'wrong-secret' }, MOCK_TOKEN);
    assert.equal(invalid, false);
  });

  test('Webhook deduplication — duplicate update_id not processed twice', async () => {
    clearDeduplicationCache();

    let processedCallsCount = 0;
    registerUpdateHandler('message', async () => {
      processedCallsCount++;
      return { status: 200, body: 'OK' };
    });

    const req = {
      headers: { 'x-telegram-bot-api-secret-token': MOCK_SECRET },
      body: { update_id: 88001, message: { text: 'hello' } }
    };
    const config = { telegramBotToken: MOCK_TOKEN };

    const res1 = await handleWebhook(req, config, {});
    assert.equal(res1.status, 200);
    assert.equal(processedCallsCount, 1);

    const res2 = await handleWebhook(req, config, {});
    assert.equal(res2.status, 200);
    assert.equal(processedCallsCount, 1, 'Duplicate update must not call update handler again');

    // Fill cache past eviction limit (1000), the original ID gets evicted and processes again
    for (let i = 1; i <= 1001; i++) {
      const reqEvict = {
        headers: { 'x-telegram-bot-api-secret-token': MOCK_SECRET },
        body: { update_id: 88001 + i, message: { text: `evict-${i}` } }
      };
      await handleWebhook(reqEvict, config, {});
    }
    await handleWebhook(req, config, {});
    assert.equal(processedCallsCount, 1003); // 1 (initial) + 1001 (inserts) + 1 (evicted call re-ran)
  });

  test('Configurable settings parser', async () => {
    clearDeduplicationCache();
    configureWebhookFramework({
      parseSettingsFromQuery: (query = {}) => ({ owner: query.owner || '' })
    });

    let observedOwner = null;
    registerUpdateHandler('message', async (_message, ctx) => {
      observedOwner = ctx.ownerId;
      return { status: 200, body: 'OK' };
    });

    const req = {
      headers: { 'x-telegram-bot-api-secret-token': MOCK_SECRET },
      query: { owner: '12345' },
      body: { update_id: 99001, message: { text: 'hello' } }
    };
    const config = { telegramBotToken: MOCK_TOKEN };
    await handleWebhook(req, config, {});
    assert.equal(observedOwner, '12345');

    // Reset to framework defaults
    configureWebhookFramework({
      parseSettingsFromQuery: (query = {}) => ({ owner: query.owner || '' })
    });
    setDebugOwnerId(null);
  });

  test('hasBotMention helper', () => {
    const msgWithMention = {
      text: '@mybot hello',
      entities: [{ type: 'mention', offset: 0, length: 6 }]
    };
    assert.equal(hasBotMention(msgWithMention, 'mybot'), true);
    assert.equal(hasBotMention(msgWithMention, 'otherbot'), false);

    const msgWithoutMention = { text: 'hello world' };
    assert.equal(hasBotMention(msgWithoutMention, 'mybot'), false);
  });

  test('isMessageDirectedToBot helper', async () => {
    installMockFetch({
      '/getMe': () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: 777, username: 'mybot', supports_guest_queries: true } }),
        text: async () => ''
      })
    });

    const privateMsg = { chat: { type: 'private' }, text: 'hello' };
    assert.equal(await isMessageDirectedToBot(privateMsg, MOCK_TOKEN, false), true);

    const cmdForOtherBot = { chat: { type: 'group' }, text: '/start@otherbot' };
    assert.equal(await isMessageDirectedToBot(cmdForOtherBot, MOCK_TOKEN, false), false);

    const cmdForThisBot = { chat: { type: 'group' }, text: '/start@mybot' };
    assert.equal(await isMessageDirectedToBot(cmdForThisBot, MOCK_TOKEN, false), true);
  });
});
