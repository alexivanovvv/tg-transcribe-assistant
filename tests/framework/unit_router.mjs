import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerCommand,
  COMMAND_REGISTRY,
  registerHttpRoute,
  dispatchHttpRoute,
  generateHelpText,
  syncBotCommands,
  handleHealthCheck
} from '../../lib/framework/router.js';
import { handleVercelRequest, handleNetlifyRequest } from '../../lib/framework/adapters.js';
import { installMockFetch, restoreFetch, recordedCalls, mkJson } from '../whitebox_helper.mjs';

describe('Framework unit_router', () => {
  beforeEach(() => {
    COMMAND_REGISTRY.length = 0;
    recordedCalls.length = 0;
  });
  afterEach(() => restoreFetch());

  test('COMMAND_REGISTRY and HTTP_ROUTES', async () => {
    registerCommand('testcmd', async () => true, { isAdmin: false, descriptionKey: 'cmdTest' });
    registerCommand('admincmd', async () => true, { isAdmin: true, descriptionKey: 'cmdAdmin' });
    registerCommand('readme', 'README.md', { isAdmin: false, descriptionKey: 'cmdReadme' });
    registerCommand('urlreadme', 'https://github.com/user/repo/blob/main/README.md', { isAdmin: false });

    assert.equal(COMMAND_REGISTRY.length, 4);

    installMockFetch({
      'raw.githubusercontent.com': () => new Response('# Title\nContent'),
      '/sendDocument': () => mkJson({ ok: true, result: {} })
    });

    const localCmd = COMMAND_REGISTRY.find(c => c.command === 'readme');
    const localRes = await localCmd.handler({}, { chatId: 12345, token: 'mock_token' });
    assert.equal(localRes, true);

    const urlCmd = COMMAND_REGISTRY.find(c => c.command === 'urlreadme');
    const urlRes = await urlCmd.handler({}, { chatId: 12345, token: 'mock_token' });
    assert.equal(urlRes, true);

    // Test sendDocument fallback to sendMessage
    installMockFetch({
      '/sendDocument': () => mkJson({ ok: false, description: 'Send error' }),
      '/sendMessage': () => mkJson({ ok: true, result: {} })
    });
    const fallbackRes = await localCmd.handler({}, { chatId: 12345, token: 'mock_token' });
    assert.equal(fallbackRes, true);

    registerHttpRoute('/api/test-route', async () => ({ status: 200, body: 'OK' }));
    const res = await dispatchHttpRoute({ urlPath: '/api/test-route', method: 'GET' }, {});
    assert.equal(res.status, 200);
    assert.equal(res.body, 'OK');

    const res404 = await dispatchHttpRoute({ urlPath: '/api/non-existent', method: 'GET' }, {});
    assert.equal(res404.status, 404);
  });

  test('generateHelpText', async () => {
    registerCommand('start', () => {}, { isAdmin: false, descriptionKey: 'helpStart' });
    registerCommand('config', () => {}, { isAdmin: true, descriptionKey: 'helpConfig' });

    const mockTranslate = (lang, key, params = {}) => {
      const keys = {
        helpStart: 'Start bot',
        helpConfig: 'Config bot',
        botVersion: '⚙️ Version: `{val}`'
      };
      let text = keys[key] || key;
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
      }
      return text;
    };

    const helpUser = generateHelpText(false, 'en', '1.2.3', 'Hello!', 'Admin Settings:', mockTranslate);
    assert.ok(helpUser.includes('/start \\- Start bot'));
    assert.ok(!helpUser.includes('/config'));
    assert.ok(helpUser.includes('1.2.3'));

    const helpAdmin = generateHelpText(true, 'en', '1.2.3', 'Hello!', 'Admin Settings:', mockTranslate);
    assert.ok(helpAdmin.includes('/start \\- Start bot'));
    assert.ok(helpAdmin.includes('/config \\- Config bot'));
    assert.ok(helpAdmin.includes('Admin Settings:'));
  });

  test('syncBotCommands', async () => {
    registerCommand('start', () => {}, { isAdmin: false, descriptionKey: 'helpStart' });
    registerCommand('config', () => {}, { isAdmin: true, descriptionKey: 'helpConfig' });

    const mockTranslate = (lang, key) => key;

    installMockFetch();

    await syncBotCommands('mock_token', '99999', 'en', mockTranslate);

    const globalCall = recordedCalls.find(c => c.url.includes('/setMyCommands') && !c.json.scope);
    assert.ok(globalCall, 'global setMyCommands should be called');
    assert.equal(globalCall.json.commands.length, 1);
    assert.equal(globalCall.json.commands[0].command, 'start');

    const scopedCall = recordedCalls.find(c => c.url.includes('/setMyCommands') && c.json.scope?.type === 'chat');
    assert.ok(scopedCall, 'scoped setMyCommands should be called');
    assert.equal(scopedCall.json.scope.chat_id, 99999);
    assert.equal(scopedCall.json.commands.length, 2);
  });

  test('handleHealthCheck — unauthenticated', async () => {
    const res = await handleHealthCheck({ query: {} }, { telegramBotToken: 'tok', version: '2.0.0' });
    assert.equal(res.status, 200);
    assert.equal(res.body.version, '2.0.0');
    assert.equal(res.body.status, 'healthy');
    assert.ok(res.body.tests.crypto.ok);
    assert.equal(res.body.tests.telegram_connectivity.status, 'unverified');
  });

  test('handleHealthCheck — authenticated with token', async () => {
    installMockFetch({
      '/getMe': () => mkJson({ ok: true, result: { id: 77, username: 'testbot', first_name: 'Test' } }),
      '/getWebhookInfo': () => mkJson({ ok: true, result: { url: 'https://test.com/api/webhook' } })
    });

    const resAuth = await handleHealthCheck(
      { query: { token: 'tok' }, headers: { host: 'test.com', 'x-forwarded-proto': 'https' } },
      { telegramBotToken: 'tok', version: '2.0.0' }
    );
    assert.equal(resAuth.status, 200);
    assert.equal(resAuth.body.tests.telegram_connectivity.ok, true);
    assert.equal(resAuth.body.tests.telegram_connectivity.bot?.username, 'testbot');
    assert.equal(resAuth.body.tests.telegram_connectivity.webhook?.url, 'https://test.com/api/webhook');
  });

  test('Vercel and Netlify adapters', async () => {
    registerHttpRoute('/api/mock-route', async () => ({ status: 200, headers: { 'Content-Type': 'text/html' }, body: 'HTML' }));

    let code = null;
    let sentBody = null;
    const mockRes = {
      status: (c) => { code = c; return mockRes; },
      setHeader: () => mockRes,
      send: (b) => { sentBody = b; return mockRes; }
    };
    await handleVercelRequest({ url: '/api/mock-route', method: 'GET', query: {} }, mockRes, { telegramBotToken: 'tok' });
    assert.equal(code, 200);
    assert.equal(sentBody, 'HTML');

    const resNetlify = await handleNetlifyRequest(
      { path: '/api/mock-route', httpMethod: 'GET', headers: {}, body: null, isBase64Encoded: false },
      {},
      { telegramBotToken: 'tok' }
    );
    assert.equal(resNetlify.statusCode, 200);
    assert.equal(resNetlify.body, 'HTML');
  });
});
