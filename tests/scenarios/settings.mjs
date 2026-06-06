import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook, handleSetup } from '../../lib/core.js';
import { handleDashboard } from '../../lib/dashboard.js';
import {
  MOCK_CONFIG,
  MOCK_CTX,
  MOCK_TOKEN,
  createReq,
  clearHistory,
  assertMessageSent,
  assertNoMessageSent,
  setupFetchMock,
  recordedCalls
} from './helper.mjs';

describe('Settings Scenarios', () => {
  before(() => setupFetchMock());
  afterEach(() => clearHistory());

  // ----------------------------------------------------
  // /webhook <url> command pre-flight check
  // ----------------------------------------------------
  test('/webhook command performs health check and updates webhook', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr === 'https://new-bot.vercel.app/api/health') {
        return { ok: true, status: 200, text: async () => 'OK' };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1008,
        message: {
          message_id: 208,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          text: '/webhook https://new-bot.vercel.app',
          entities: [{ type: 'bot_command', offset: 0, length: 8 }]
        }
      };
      const req = createReq(update, { owner: '12345', langbot: 'en' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      const setWebhookCall = recordedCalls.find(c => c.url.includes('/setWebhook'));
      assert.ok(setWebhookCall, 'setWebhook should have been called');
      const newUrlParams = new URL(setWebhookCall.json.url).searchParams;
      assert.equal(new URL(setWebhookCall.json.url).origin, 'https://new-bot.vercel.app', 'New webhook must point to the new domain');
      assert.equal(newUrlParams.get('owner'), '12345', 'Owner param must be preserved');
      assertMessageSent('12345', /updated successfully/i);
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Dashboard Pre-flight URL Validation
  // ----------------------------------------------------
  test('Dashboard blocks registration for invalid protocols, localhost, or unsupported ports', async () => {
    // Invalid localhost HTTP
    const resHttp = await handleDashboard({ headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' } }, MOCK_CONFIG);
    assert.ok(resHttp.body.includes('Telegram requires secure HTTPS.'), 'Must block HTTP');

    // Localhost HTTPS
    const resLocalhost = await handleDashboard({ headers: { host: '127.0.0.1:443', 'x-forwarded-proto': 'https' } }, MOCK_CONFIG);
    assert.ok(resLocalhost.body.includes('Localhost address is not reachable.'), 'Must block localhost');

    // Valid HTTPS but unsupported port
    const resPort = await handleDashboard({ headers: { host: 'mybot.example.com:8080', 'x-forwarded-proto': 'https' } }, MOCK_CONFIG);
    assert.ok(resPort.body.includes('Port 8080 is not supported.'), 'Must block unsupported port');
  });

  // ----------------------------------------------------
  // Reset Owner via handleSetup
  // ----------------------------------------------------
  test('handleSetup clears owner ID via reset_owner action', async () => {
    const req = {
      headers: { host: 'mybot.example.com', 'x-forwarded-proto': 'https' },
      query: { action: 'reset_owner', token: MOCK_TOKEN }
    };
    const res = await handleSetup(req, MOCK_CONFIG);
    assert.equal(res.status, 200);
    const setWebhookCall = recordedCalls.find(c => c.url.includes('/setWebhook'));
    assert.ok(setWebhookCall, 'setWebhook should be called to clear owner');
    const params = new URL(setWebhookCall.json.url).searchParams;
    assert.ok(!params.get('owner'), 'Owner parameter must be cleared/omitted');
  });

  // ----------------------------------------------------
  // Callback Query from Non-Owner (Should Reject)
  // ----------------------------------------------------
  test('Callback query from non-owner is rejected', async () => {
    const update = {
      update_id: 1015,
      callback_query: {
        id: 'query_15',
        from: { id: 99999, first_name: 'Imposter' },
        message: {
          chat: { id: 12345, type: 'private' },
          message_id: 501,
          text: 'Settings'
        },
        data: 'mode:toggle:groups'
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    const ansCall = recordedCalls.find(c => c.url.includes('/answerCallbackQuery'));
    assert.ok(ansCall, 'answerCallbackQuery should be called');
    assert.equal(ansCall.json?.callback_query_id, 'query_15');
    assert.ok(ansCall.json?.text.includes('Unauthorized') || ansCall.json?.text.includes('Отказано'), 'Should return unauthorized text');
    assert.equal(ansCall.json?.show_alert, true);
  });

  // ----------------------------------------------------
  // Callback Query from Owner Toggles Setting
  // ----------------------------------------------------
  test('Callback query from owner toggles groups setting', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=12345&groups=on', allowed_updates: ['message'] }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1016,
        callback_query: {
          id: 'query_16',
          from: { id: 12345, first_name: 'Owner' },
          message: {
            chat: { id: 12345, type: 'private' },
            message_id: 502,
            text: 'Settings'
          },
          data: 'mode:toggle:groups'
        }
      };
      const req = createReq(update, { owner: '12345' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      const setWebhookCall = recordedCalls.find(c => c.url.includes('/setWebhook'));
      assert.ok(setWebhookCall, 'setWebhook should be called to update settings');
      const params = new URL(setWebhookCall.json.url).searchParams;
      assert.equal(params.get('groups'), 'off', 'Groups setting must be toggled to off');

      const editMsgCall = recordedCalls.find(c => c.url.includes('/editMessageText'));
      assert.ok(editMsgCall, 'editMessageText should be called');
      assert.equal(String(editMsgCall.json?.message_id), '502');

      const ansCall = recordedCalls.find(c => c.url.includes('/answerCallbackQuery'));
      assert.ok(ansCall, 'answerCallbackQuery should be called to dismiss loader');
      assert.equal(ansCall.json?.callback_query_id, 'query_16');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Groups Toggle Works Even When can_join_groups=false
  // ----------------------------------------------------
  test('Groups toggle succeeds even when BotFather has can_join_groups=false', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=12345&groups=on', allowed_updates: ['message'] }
          })
        };
      }
      if (urlStr.includes('/getMe')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { id: 999999, first_name: 'Transcribot', username: 'tg_transcribot', can_join_groups: false }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 10162,
        callback_query: {
          id: 'query_16b',
          from: { id: 12345, first_name: 'Owner' },
          message: {
            chat: { id: 12345, type: 'private' },
            message_id: 503,
            reply_markup: { inline_keyboard: [[{ text: 'Groups', callback_data: 'nav:config:' }]] }
          },
          data: 'mode:toggle:groups:on'
        }
      };
      const req = createReq(update, { owner: '12345' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      const setWebhookCall = recordedCalls.find(c => c.url.includes('/setWebhook'));
      assert.ok(setWebhookCall, 'setWebhook should be called: groups toggle must work regardless of can_join_groups');
      const params = new URL(setWebhookCall.json.url).searchParams;
      assert.equal(params.get('groups'), 'off', 'Groups should be toggled off');

      const editMsgCall = recordedCalls.find(c => c.url.includes('/editMessageText'));
      assert.ok(editMsgCall, 'editMessageText should be called to refresh menu');

      const ansCall = recordedCalls.find(c => c.url.includes('/answerCallbackQuery'));
      assert.ok(ansCall, 'answerCallbackQuery should be called to dismiss loader');
      assert.equal(ansCall.json?.callback_query_id, 'query_16b');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // noJoin Info Button Sends modeDisabledGroups Message
  // ----------------------------------------------------
  test('Tapping the "⚠️ Join Groups" info button sends BotFather instructions', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message'] }
          })
        };
      }
      if (urlStr.includes('/getMe')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { id: 999999, first_name: 'Transcribot', username: 'tg_transcribot', can_join_groups: false }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 10163,
        callback_query: {
          id: 'query_16c',
          from: { id: 12345, first_name: 'Owner' },
          message: {
            chat: { id: 12345, type: 'private' },
            message_id: 504,
            reply_markup: { inline_keyboard: [[{ text: '⚠️ Join Groups', callback_data: 'mode:noJoin:' }]] }
          },
          data: 'mode:noJoin:'
        }
      };
      const req = createReq(update, { owner: '12345' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      const sendMsgCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
      assert.ok(sendMsgCall, 'sendMessage should be called with BotFather instructions');
      assert.ok(
        sendMsgCall.json?.text.includes('/setjoingroups') || sendMsgCall.json?.text.includes('Allow Groups'),
        'Message should contain BotFather instructions with /setjoingroups'
      );
      const setWebhookCall = recordedCalls.find(c => c.url.includes('/setWebhook'));
      assert.equal(setWebhookCall, undefined, 'setWebhook should not be called for noJoin info action');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Non-Owner Configuration Command (Should Ignore)
  // ----------------------------------------------------
  test('Configuration command from non-owner is ignored', async () => {
    const update = {
      update_id: 1017,
      message: {
        message_id: 217,
        chat: { id: 12345, type: 'private' },
        from: { id: 99999 }, // Imposter
        text: '/mode',
        entities: [{ type: 'bot_command', offset: 0, length: 5 }]
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertNoMessageSent();
  });

  // ----------------------------------------------------
  // /settings command displays all current settings to owner
  // ----------------------------------------------------
  test('/settings command displays all current settings to owner', async () => {
    const update = {
      update_id: 1018,
      message: {
        message_id: 218,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        text: '/settings',
        entities: [{ type: 'bot_command', offset: 0, length: 9 }]
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /Owner Settings/i);
    assertMessageSent('12345', /Language/i);
    assertMessageSent('12345', /Technical/i);
    assertMessageSent('12345', /Webhook/i);
    assertMessageSent('12345', /Prompt/i);
  });

  // ----------------------------------------------------
  // /lang command restores Back button from LAST_MENU_BACK cache
  // ----------------------------------------------------
  test('/lang command preserves Back button via LAST_MENU_BACK cache', async () => {
    // Step 1: Fill cache — simulate callback_query on lang menu
    const langMenuMessage = {
      message_id: 838,
      chat: { id: 12345, type: 'private' },
      from: { id: 999999, is_bot: true },
      text: '🗣️ Whisper: язык',
      reply_markup: {
        inline_keyboard: [
          [{ text: '« Назад', callback_data: 'nav:config:', style: 'success' }]
        ]
      }
    };
    const navUpdate = {
      update_id: 1038,
      callback_query: {
        id: 'cbq_38',
        from: { id: 12345 },
        message: langMenuMessage,
        chat_instance: 'ci_38',
        data: 'lang:set:auto'
      }
    };
    await handleWebhook(createReq(navUpdate, { owner: '12345' }), MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Step 2: User types /lang ja
    clearHistory();
    let editMessageTextBody = null;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/editMessageText')) {
        editMessageTextBody = JSON.parse(options.body);
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 838 } }) };
      }
      if (urlStr.includes('/deleteMessage')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
      }
      return baseFetch(url, options);
    };
    try {
      const langUpdate = {
        update_id: 1039,
        message: {
          message_id: 839,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          text: '/lang ja',
          entities: [{ type: 'bot_command', offset: 0, length: 5 }]
        }
      };
      await handleWebhook(createReq(langUpdate, { owner: '12345' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(editMessageTextBody, 'Should have called editMessageText');
      const keyboard = editMessageTextBody.reply_markup?.inline_keyboard || [];
      const backBtn = keyboard.flat().find(btn => btn.callback_data === 'nav:config:');
      assert.ok(backBtn, 'Back button must point to "config" (restored from LAST_MENU_BACK)');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // /lang command opens NEW menu when cache has a different menuId
  // ----------------------------------------------------
  test('/lang command opens new menu when cached message shows a different menu', async () => {
    // Step 1: Fill cache with a 'prompt' menu (not 'lang')
    const promptMenuMessage = {
      message_id: 900,
      chat: { id: 12345, type: 'private' },
      from: { id: 999999, is_bot: true },
      text: '✍️ Whisper: промпт',
      reply_markup: {
        inline_keyboard: [
          [{ text: '« Назад', callback_data: 'nav:config:', style: 'success' }]
        ]
      }
    };
    const navUpdate = {
      update_id: 1040,
      callback_query: {
        id: 'cbq_39',
        from: { id: 12345 },
        message: promptMenuMessage,
        chat_instance: 'ci_39',
        data: 'prompt:set:default'
      }
    };
    await handleWebhook(createReq(navUpdate, { owner: '12345' }), MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Step 2: User sends /lang ja — cache has 'prompt' menu, not 'lang'
    clearHistory();
    let editCalled = false;
    let sendMessageCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/editMessageText')) {
        editCalled = true;
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 900 } }) };
      }
      if (urlStr.includes('/sendMessage')) {
        sendMessageCalled = true;
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 901 } }) };
      }
      if (urlStr.includes('/deleteMessage')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
      }
      return baseFetch(url, options);
    };
    try {
      const langUpdate = {
        update_id: 1041,
        message: {
          message_id: 902,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          text: '/lang ja',
          entities: [{ type: 'bot_command', offset: 0, length: 5 }]
        }
      };
      await handleWebhook(createReq(langUpdate, { owner: '12345' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.equal(editCalled, false, 'Should NOT call editMessageText when cached menu is different');
      assert.ok(sendMessageCalled, 'Should call sendMessage to open a new lang menu');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // /lang command fallback to sendMessage when updateMenu fails
  // ----------------------------------------------------
  test('/lang command fallback to sendMessage when updateMenu fails (message to edit not found)', async () => {
    // Step 1: Fill cache with 'lang' menu
    const langMenuMessage = {
      message_id: 1000,
      chat: { id: 12345, type: 'private' },
      from: { id: 999999, is_bot: true },
      text: '🗣️ Whisper: язык',
      reply_markup: {
        inline_keyboard: [
          [{ text: '« Назад', callback_data: 'nav:config:', style: 'success' }]
        ]
      }
    };
    const navUpdate = {
      update_id: 1045,
      callback_query: {
        id: 'cbq_40',
        from: { id: 12345 },
        message: langMenuMessage,
        chat_instance: 'ci_40',
        data: 'lang:set:auto'
      }
    };
    await handleWebhook(createReq(navUpdate, { owner: '12345' }), MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Step 2: /lang ja but editMessageText returns "message to edit not found"
    clearHistory();
    let editCalled = false;
    let sendMessageFeedbackCalled = false;
    let sendMessageMenuCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/editMessageText')) {
        editCalled = true;
        return {
          ok: false,
          status: 400,
          json: async () => ({ ok: false, description: 'Bad Request: message to edit not found' })
        };
      }
      if (urlStr.includes('/sendMessage')) {
        const body = JSON.parse(options.body);
        if (body.text?.includes('Language:')) {
          sendMessageFeedbackCalled = true;
        } else {
          sendMessageMenuCalled = true;
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1001 } }) };
      }
      if (urlStr.includes('/deleteMessage')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
      }
      return baseFetch(url, options);
    };
    try {
      const langUpdate = {
        update_id: 1046,
        message: {
          message_id: 1002,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          text: '/lang ja',
          entities: [{ type: 'bot_command', offset: 0, length: 5 }]
        }
      };
      await handleWebhook(createReq(langUpdate, { owner: '12345' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(editCalled, 'Should attempt to call editMessageText');
      assert.equal(sendMessageFeedbackCalled, false, 'Should NOT send feedback message');
      assert.ok(sendMessageMenuCalled, 'Should send menu message as a new message');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });
});
