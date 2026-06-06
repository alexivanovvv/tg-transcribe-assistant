import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MENU_REGISTRY } from '../../lib/framework/menu.js';
import { cleanTitleText } from '../../lib/menus.js'; // Registers all bot menus

describe('Bot unit_menus', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockCtx = {
    token: 'mock-bot-token',
    lang: 'en',
    userLangCode: 'ru',
    webhookUrl: 'https://example.com/api/webhook',
    botInfo: {
      can_join_groups: true,
      can_connect_to_business: true,
      supports_guest_queries: true
    },
    message: { chat: { id: 12345 } },
    callbackQueryId: 'cbq-123',
    config: { whisperPrompt: 'Default system prompt' }
  };

  test('cleanTitleText utility', () => {
    assert.equal(cleanTitleText(null), '');
    assert.equal(cleanTitleText('[Title](https://link.com)\nSecond line'), 'Title');
    assert.equal(cleanTitleText('*Bold title*:'), 'Bold title');
  });

  test('config menu rendering and setbotinfo action', async () => {
    const configMenu = MENU_REGISTRY['config'];
    assert.ok(configMenu);

    const settings = {
      lang: 'en',
      model: 'whisper-large-v3',
      prompt: 'Test prompt',
      langbot: 'en',
      groups: true,
      secretary: true,
      guest: false,
      verbose: true,
      notify_add: true,
      notify_conn: false,
      notify_err: true
    };

    // Test prepare when webhookUrl/botInfo are missing
    const emptyCtx = { token: 'mock-token', lang: 'en' };
    globalThis.fetch = async (url) => {
      if (url.includes('/getWebhookInfo')) {
        return new Response(JSON.stringify({ ok: true, result: { url: 'https://test.domain.com/webhook' } }));
      }
      if (url.includes('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { id: 999, username: 'testbot' } }));
      }
      return new Response(JSON.stringify({ ok: true }));
    };

    await configMenu.prepare(settings, 'en', emptyCtx);
    assert.equal(emptyCtx.webhookUrl, 'https://test.domain.com/webhook');
    assert.equal(emptyCtx.botInfo?.username, 'testbot');

    const title = configMenu.getTitle(settings, 'en');
    assert.ok(title);

    const text = configMenu.getText(settings, 'en', mockCtx);
    assert.ok(text.includes('example'));

    const buttons = configMenu.getButtons(settings, 'en');
    assert.ok(buttons.length >= 8);

    // Test setbotinfo action
    let callbackAnswered = false;
    globalThis.fetch = async (url) => {
      if (url.includes('/answerCallbackQuery')) {
        callbackAnswered = true;
      }
      return new Response(JSON.stringify({ ok: true }));
    };

    const actionRes = await configMenu.handleAction('setbotinfo', null, settings, mockCtx);
    assert.equal(actionRes.handled, true);
    assert.equal(callbackAnswered, true);
  });

  test('mode menu state rendering and actions', async () => {
    const modeMenu = MENU_REGISTRY['mode'];
    assert.ok(modeMenu);

    const settings = { groups: true, secretary: false, guest: false };
    
    // 1. getValue with disabled groups badge
    const disabledGroupsCtx = {
      botInfo: { can_join_groups: false, can_connect_to_business: false, supports_guest_queries: false }
    };
    const valText = modeMenu.getValue(settings, 'en', disabledGroupsCtx);
    assert.ok(valText.includes('Groups'));

    // 2. prepare & getButtons
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { can_join_groups: false, can_connect_to_business: false, supports_guest_queries: false } }));
    await modeMenu.prepare(settings, 'en', mockCtx);
    const buttons = modeMenu.getButtons(settings, 'en', mockCtx);
    assert.ok(buttons.some(r => r[0].action === 'noJoin'));

    // 3. handleAction 'noJoin'
    let sentMessageText = null;
    globalThis.fetch = async (url, options) => {
      if (url.includes('/sendMessage')) {
        const body = JSON.parse(options.body);
        sentMessageText = body.text;
      }
      return new Response(JSON.stringify({ ok: true }));
    };

    const noJoinRes = await modeMenu.handleAction('noJoin', '', settings, mockCtx);
    assert.equal(noJoinRes.handled, true);
    assert.ok(sentMessageText);

    // 4. handleAction out-of-sync state mismatch
    const outOfSyncRes = await modeMenu.handleAction('toggle', 'groups:off', settings, mockCtx);
    assert.equal(outOfSyncRes.refreshed, true);

    // 5. handleAction 'toggle' groups transitions: true -> false -> 'leave' -> true
    settings.groups = true;
    await modeMenu.handleAction('toggle', 'groups:on', settings, mockCtx);
    assert.equal(settings.groups, false);
    await modeMenu.handleAction('toggle', 'groups:off', settings, mockCtx);
    assert.equal(settings.groups, 'leave');
    await modeMenu.handleAction('toggle', 'groups:leave', settings, mockCtx);
    assert.equal(settings.groups, true);

    // 6. handleAction 'disabled' when capability is restricted
    const disabledRes = await modeMenu.handleAction('disabled', 'secretary:off', settings, mockCtx);
    assert.equal(disabledRes.handled, true);
  });

  test('langbot menu rendering, actions, and onUpdated', async () => {
    const langbotMenu = MENU_REGISTRY['langbot'];
    assert.ok(langbotMenu);

    const settings = { autodetect: true, langbot: 'auto' };

    const title = langbotMenu.getTitle(settings, 'en');
    assert.ok(title);

    const value = langbotMenu.getValue(settings, 'en', mockCtx);
    assert.ok(value.includes('Auto') || value.includes('ru'));

    const text = langbotMenu.getText(settings, 'en');
    assert.ok(text);

    const buttons = langbotMenu.getButtons(settings, 'en', mockCtx);
    assert.ok(buttons.length > 2);

    // Toggle auto
    await langbotMenu.handleAction('toggle', 'auto', settings, mockCtx);
    assert.equal(settings.autodetect, false);
    assert.equal(settings.langbot, 'en');

    // Set specific language
    await langbotMenu.handleAction('set', 'ru', settings, mockCtx);
    assert.equal(settings.langbot, 'ru');

    // Test onUpdated trigger
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }));
    await langbotMenu.onUpdated(settings, mockCtx);
    assert.equal(mockCtx.lang, 'ru');
  });

  test('lang menu rendering and actions', async () => {
    const langMenu = MENU_REGISTRY['lang'];
    assert.ok(langMenu);

    const settings = { lang: 'ja' }; // Non-standard language code

    const title = langMenu.getTitle(settings, 'en');
    assert.ok(title);

    const val = langMenu.getValue(settings, 'en');
    assert.ok(val.includes('JA'));

    const text = langMenu.getText(settings, 'en');
    assert.ok(text);

    const buttons = langMenu.getButtons(settings, 'en');
    assert.ok(buttons.length > 3);
    const lastRow = buttons[buttons.length - 1];
    const otherBtn = lastRow.find(b => b.switch_inline_query_current_chat?.includes('/lang ja'));
    assert.ok(otherBtn);

    await langMenu.handleAction('set', 'auto', settings);
    assert.equal(settings.lang, 'auto');
  });

  test('model, verbose, and prompt menus', async () => {
    const modelMenu = MENU_REGISTRY['model'];
    const verboseMenu = MENU_REGISTRY['verbose'];
    const promptMenu = MENU_REGISTRY['prompt'];

    const settings = { model: 'whisper-large-v3', verbose: true, prompt: undefined };

    // model
    assert.equal(modelMenu.getValue(settings, 'en', mockCtx), 'whisper-large-v3');
    await modelMenu.handleAction('set', 'whisper-large-v3-turbo', settings);
    assert.equal(settings.model, 'whisper-large-v3-turbo');

    // verbose
    assert.equal(verboseMenu.getValue(settings, 'en'), '✅');
    await verboseMenu.handleAction('set', 'false', settings);
    assert.equal(settings.verbose, false);

    // prompt
    assert.ok(promptMenu.getValue(settings, 'en', mockCtx));
    assert.ok(promptMenu.getText(settings, 'en', mockCtx));

    await promptMenu.handleAction('set', 'empty', settings);
    assert.equal(settings.prompt, '');

    await promptMenu.handleAction('set', 'default', settings);
    assert.equal(settings.prompt, undefined);
  });

  test('notify and webhook menus', async () => {
    const notifyMenu = MENU_REGISTRY['notify'];
    const webhookMenu = MENU_REGISTRY['webhook'];

    const settings = { groups: true, secretary: true, notify_add: true, notify_conn: true, notify_err: true };

    // notify prepare & rendering
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { can_join_groups: true, can_connect_to_business: true } }));
    await notifyMenu.prepare(settings, 'en', mockCtx);

    const val = notifyMenu.getValue(settings, 'en', mockCtx);
    assert.ok(val);

    const buttons = notifyMenu.getButtons(settings, 'en', mockCtx);
    assert.equal(buttons.length, 3);

    await notifyMenu.handleAction('toggle', 'add', settings);
    assert.equal(settings.notify_add, false);

    await notifyMenu.handleAction('toggle', 'conn', settings);
    assert.equal(settings.notify_conn, false);

    await notifyMenu.handleAction('toggle', 'err', settings);
    assert.equal(settings.notify_err, false);

    // webhook
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { url: 'https://webhook.site/test' } }));
    await webhookMenu.prepare(settings, 'en', mockCtx);
    assert.equal(webhookMenu.getValue(settings, 'en', mockCtx), 'https://webhook.site/test');
    assert.ok(webhookMenu.getText(settings, 'en', mockCtx).includes('https://webhook.site/test'));
    const wbRes = await webhookMenu.handleAction();
    assert.equal(wbRes.handled, true);
  });
});
