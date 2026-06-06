import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeWebhookSetupHandler } from '../../lib/framework/setup.js';
import { MOCK_TOKEN, installMockFetch, restoreFetch, mkJson } from '../whitebox_helper.mjs';

describe('Framework unit_setup', () => {
  afterEach(() => restoreFetch());

  test('makeWebhookSetupHandler validation and error branches', async () => {
    assert.throws(() => makeWebhookSetupHandler({}), /makeWebhookSetupHandler requires buildWebhookSetup function/);

    const handler = makeWebhookSetupHandler({
      buildWebhookSetup: (baseUrl, token, settings, secret) => ({ url: `${baseUrl}?secret=${secret}` }),
      parseWebhookConfig: () => ({ owner: '99' }),
      getDefaultSettings: () => ({ defaultKey: 'val' })
    });

    // Missing token in config
    const resNoToken = await handler({}, {});
    assert.equal(resNoToken.status, 500);

    // Token mismatch
    const resBadToken = await handler({ query: { token: 'bad' } }, { telegramBotToken: MOCK_TOKEN });
    assert.equal(resBadToken.status, 403);
  });

  test('makeWebhookSetupHandler successful registration and reset_owner', async () => {
    const handler = makeWebhookSetupHandler({
      buildWebhookSetup: (baseUrl, token, settings, secret) => ({ url: `${baseUrl}?secret=${secret}` }),
      parseWebhookConfig: () => ({ owner: '99' }),
      getDefaultSettings: () => ({ defaultKey: 'val' })
    });

    installMockFetch({
      '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://old.url' } }),
      '/setWebhook': () => mkJson({ ok: true, result: true })
    });

    const req = { query: { token: MOCK_TOKEN }, headers: { host: 'test.com' } };
    const resOk = await handler(req, { telegramBotToken: MOCK_TOKEN });
    assert.equal(resOk.status, 200);
    assert.equal(resOk.body.ok, true);

    // reset_owner action
    const reqReset = { query: { token: MOCK_TOKEN, action: 'reset_owner' }, headers: { host: 'test.com' } };
    const resReset = await handler(reqReset, { telegramBotToken: MOCK_TOKEN });
    assert.equal(resReset.status, 200);
    assert.equal(resReset.body.message, 'Owner Chat ID has been successfully reset.');
  });
});
