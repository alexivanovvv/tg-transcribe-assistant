import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook } from '../../lib/core.js';
import { clearBotInfoCache } from '../../lib/framework/webhook.js';
import {
  MOCK_CONFIG,
  MOCK_CTX,
  createReq,
  clearHistory,
  assertMessageSent,
  assertNoMessageSent,
  recordedCalls,
  setupFetchMock
} from './helper.mjs';

describe('Secretary Scenarios', () => {
  before(() => setupFetchMock());
  afterEach(() => {
    clearHistory();
    clearBotInfoCache();
  });

  // ----------------------------------------------------
  // Secretary Mode Voice Message (Should Transcribe)
  // ----------------------------------------------------
  test('Secretary/Business voice message transcribes and replies', async () => {
    const update = {
      update_id: 1003,
      business_message: {
        message_id: 203,
        chat: { id: 98765, type: 'private' },
        from: { id: 98765, first_name: 'Friend' },
        business_connection_id: 'conn_123',
        voice: { file_id: 'voice_file_987', file_size: 1000, duration: 4 }
      }
    };
    const req = createReq(update, { owner: '12345', secretary: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('98765', 'mock voice transcription');
  });

  // ----------------------------------------------------
  // ALLOWED_USERS whitelist for business connections
  // ----------------------------------------------------
  test('Whitelist: business connection of a non-whitelisted account is ignored', async () => {
    const update = {
      update_id: 1203,
      business_message: {
        message_id: 403,
        chat: { id: 98765, type: 'private' },
        from: { id: 98765, first_name: 'Friend' },
        business_connection_id: 'conn_123',
        voice: { file_id: 'voice_file_wl', file_unique_id: 'uniq_wl_1', file_size: 1000, duration: 4 }
      }
    };
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (url.toString().includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      // Mocked connection belongs to user 11111 (not owner, not listed)
      await handleWebhook(createReq(update, { owner: '12345' }), { ...MOCK_CONFIG, allowedUsers: ['someone_else'] }, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assertNoMessageSent();

      const allowedUpdate = { update_id: 1204, business_message: { ...update.business_message, message_id: 404, voice: { ...update.business_message.voice, file_unique_id: 'uniq_wl_2' } } };
      await handleWebhook(createReq(allowedUpdate, { owner: '12345' }), { ...MOCK_CONFIG, allowedUsers: ['11111'] }, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assertMessageSent('98765', 'mock voice transcription');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Secretary Private Mode (secpriv=on): transcription goes to owner only
  // ----------------------------------------------------
  test('Secretary private mode delivers transcription to owner chat, not the business chat', async () => {
    const update = {
      update_id: 1103,
      business_message: {
        message_id: 303,
        chat: { id: 98765, type: 'private', first_name: 'Friend' },
        from: { id: 98765, first_name: 'Friend' },
        business_connection_id: 'conn_123',
        voice: { file_id: 'voice_file_secpriv', file_unique_id: 'uniq_secpriv', file_size: 1000, duration: 4 }
      }
    };
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (url.toString().includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=12345&secpriv=on', allowed_updates: ['message', 'business_message'] }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const req = createReq(update, { owner: '12345', secretary: 'on', secpriv: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 200));
      assertMessageSent('12345', /Friend[\s\S]*mock voice transcription/);
      const leaked = recordedCalls.find(call => call.url.includes('/sendMessage') &&
        (String(call.json?.chat_id) === '98765' || call.json?.business_connection_id));
      assert.equal(leaked, undefined, 'Nothing must be sent into the business chat');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Secretary Mode Unsupported Document (Should Ignore Completely)
  // ----------------------------------------------------
  test('Secretary/Business PDF document is ignored completely (no replies)', async () => {
    const update = {
      update_id: 1004,
      business_message: {
        message_id: 204,
        chat: { id: 98765, type: 'private' },
        from: { id: 98765 },
        business_connection_id: 'conn_123',
        document: { file_id: 'pdf_file_987', mime_type: 'application/pdf', file_name: 'document.pdf', file_size: 20000 }
      }
    };
    const req = createReq(update, { owner: '12345', secretary: 'on' });
    const res = await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    assert.equal(res.status, 200, 'Webhook response should be 200 OK');
    await new Promise(resolve => setTimeout(resolve, 50));
    assertNoMessageSent();
  });

  // ----------------------------------------------------
  // Group Add triggers notify_add
  // ----------------------------------------------------
  test('Bot added to group triggers notify_add alert to owner', async () => {
    const update = {
      update_id: 1013,
      my_chat_member: {
        chat: { id: -777, title: 'New Group', type: 'group' },
        from: { id: 12345, first_name: 'Tester' },
        new_chat_member: { status: 'member', user: { id: 999999, is_bot: true, username: 'tg_transcribot' } }
      }
    };
    const req = createReq(update, { owner: '99999', notify_add: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('99999', /Added to group.*New Group/i);
  });

  // ----------------------------------------------------
  // Business Connection triggers notify_conn
  // ----------------------------------------------------
  test('Secretary mode connection triggers notify_conn alert to owner', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=99999&notify_conn=on', allowed_updates: ['business_connection', 'business_message'] }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1014,
        business_connection: {
          id: 'conn_123',
          user: { id: 55555, first_name: 'BusinessUser' },
          can_reply: true,
          is_enabled: true
        }
      };
      const req = createReq(update, { owner: '99999', notify_conn: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assertMessageSent('99999', /Bot is connected as a secretary/i);
      assertMessageSent('99999', /User:\*?\s*\[BusinessUser\]\(tg:\/\/user\?id=55555\)/i);
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Business Connection triggers notify_conn when secretary mode is off in settings
  // ----------------------------------------------------
  test('Secretary mode connection triggers notify_conn when secretary is off', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=99999&notify_conn=on', allowed_updates: [] }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 10142,
        business_connection: {
          id: 'conn_123',
          user: { id: 55555, first_name: 'BusinessUser' },
          can_reply: true,
          is_enabled: true
        }
      };
      const req = createReq(update, { owner: '99999', notify_conn: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assertMessageSent('99999', /Bot is connected as a secretary/i);
      assertMessageSent('99999', /User:\*?\s*\[BusinessUser\]\(tg:\/\/user\?id=55555\)/i);
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Business Connection triggers notify_conn with username in parentheses
  // ----------------------------------------------------
  test('Secretary mode connection notification contains username when present', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getWebhookInfo')) {
        return {
          ok: true, status: 200, json: async () => ({
            ok: true, result: { url: 'https://example.com/api/webhook?owner=99999&notify_conn=on', allowed_updates: ['business_connection', 'business_message'] }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 10143,
        business_connection: {
          id: 'conn_123',
          user: { id: 55555, first_name: 'Business', last_name: 'User', username: 'bizuser' },
          can_reply: true,
          is_enabled: true
        }
      };
      const req = createReq(update, { owner: '99999', notify_conn: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assertMessageSent('99999', /Bot is connected as a secretary/i);
      assertMessageSent('99999', /User:\*?\s*\[Business User\]\(tg:\/\/user\?id=55555\)\s*\\\(@bizuser\\\)/i);
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // 3rd-Party executing admin commands in secretary mode is ignored
  // ----------------------------------------------------
  test('3rd-Party executing admin command (/settings) in secretary mode is ignored', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage') || urlStr.includes('/editMessageText')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1054,
        business_message: {
          message_id: 254,
          chat: { id: 98765, type: 'private' },
          from: { id: 98765 }, // 3rd-Party
          business_connection_id: 'conn_123',
          text: '/settings',
          entities: [{ type: 'bot_command', offset: 0, length: 9 }]
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(fetchCalled, false, 'Should NOT send any reply to 3rd-Party trying to execute admin commands in secretary mode');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Owner executing admin command (/settings) in secretary mode is ignored
  // ----------------------------------------------------
  test('Owner executing admin command (/settings) in secretary mode is ignored', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage') || urlStr.includes('/editMessageText')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1055,
        business_message: {
          message_id: 255,
          chat: { id: 98765, type: 'private' },
          from: { id: 12345 }, // Owner
          business_connection_id: 'conn_123',
          text: '/settings',
          entities: [{ type: 'bot_command', offset: 0, length: 9 }]
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(fetchCalled, false, 'Should NOT execute admin commands in secretary mode even if sent by the Owner');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Client executing public command (/process) in secretary mode is served
  // ----------------------------------------------------
  test('Client /process without audio in secretary mode posts nothing to the chat (quiet chat)', async () => {
    let replyRequiredSent = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage')) {
        const body = JSON.parse(options.body);
        if (body.text && body.text.includes('reply to an audio')) {
          replyRequiredSent = true;
        }
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1056,
        business_message: {
          message_id: 256,
          chat: { id: 98765, type: 'private' },
          from: { id: 11111 }, // Client (sender.id !== chat.id)
          business_connection_id: 'conn_123',
          text: '/process',
          entities: [{ type: 'bot_command', offset: 0, length: 8 }]
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(!replyRequiredSent, 'Quiet chat: no replyRequired warning must be posted in the business chat');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // 3rd-Party executing public command (/process) in secretary mode is ignored
  // ----------------------------------------------------
  test('3rd-Party executing public command (/process) in secretary mode is ignored', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1057,
        business_message: {
          message_id: 257,
          chat: { id: 98765, type: 'private' },
          from: { id: 98765 }, // 3rd-Party (sender.id === chat.id)
          business_connection_id: 'conn_123',
          text: '/process',
          entities: [{ type: 'bot_command', offset: 0, length: 8 }]
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(fetchCalled, false, 'Should NOT respond to 3rd-Party trying to execute /process in secretary mode');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // 3rd-Party executing /process in group chat secretary mode is ignored
  // ----------------------------------------------------
  test('3rd-Party executing public command (/process) in group chat secretary mode is ignored', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1058,
        business_message: {
          message_id: 258,
          chat: { id: -100123456789, type: 'group' },
          from: { id: 98765 }, // 3rd-Party in group chat
          business_connection_id: 'conn_123',
          text: '/process',
          entities: [{ type: 'bot_command', offset: 0, length: 8 }]
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(fetchCalled, false, 'Should NOT respond to 3rd-Party trying to execute /process in group chat secretary mode');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Secretary mode explicit mention is DROPPED if guest mode is fully supported
  // ----------------------------------------------------
  test('Secretary mode explicit mention is DROPPED if guest mode is fully supported', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: true } }) };
      }
      if (urlStr.includes('/sendMessage') || urlStr.includes('/answerGuestQuery')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1059,
        business_message: {
          message_id: 259,
          chat: { id: 98765, type: 'private' },
          from: { id: 11111 },
          business_connection_id: 'conn_123',
          text: 'hello @testbot',
          entities: [{ type: 'mention', offset: 6, length: 8 }]
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on', guest: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(fetchCalled, false, 'Should drop business_message explicitly directed to bot when guest mode is ON in settings and BotFather');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Secretary mode explicit mention is PROCESSED if guest mode is OFF in local settings
  // ----------------------------------------------------
  test('Secretary mode explicit mention is PROCESSED if guest mode is OFF in local settings', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: true } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: true, json: async () => ({ ok: true, result: { user: { id: 12345 }, can_reply: true } }) };
      }
      if (urlStr.includes('sendChatAction')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) };
      }
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1060,
        business_message: {
          message_id: 260,
          chat: { id: 11111, type: 'private' },
          from: { id: 11111 }, // Regular client (NOT owner)
          business_connection_id: 'conn_123',
          voice: { file_id: 'voice_file_47', file_size: 1000, duration: 3 }
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fetchCalled, true, 'Should NOT drop business_message if guest mode is OFF in settings');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Secretary mode explicit mention is PROCESSED if guest mode is OFF in BotFather
  // ----------------------------------------------------
  test('Secretary mode explicit mention is PROCESSED if guest mode is OFF in BotFather', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345&guest=on', allowed_updates: ['message', 'business_message', 'guest_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: false } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: true, json: async () => ({ ok: true, result: { user: { id: 12345 }, can_reply: true } }) };
      }
      if (urlStr.includes('sendChatAction')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) };
      }
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1061,
        business_message: {
          message_id: 261,
          chat: { id: 11111, type: 'private' },
          from: { id: 11111 },
          business_connection_id: 'conn_123',
          voice: { file_id: 'voice_file_48', file_size: 1000, duration: 3 }
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on', guest: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fetchCalled, true, 'Should NOT drop business_message if guest mode is OFF in BotFather');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Outgoing business voice message is processed
  // ----------------------------------------------------
  test('Outgoing business voice message is processed', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: false } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: true, json: async () => ({ ok: true, result: { user: { id: 12345 }, can_reply: true } }) };
      }
      if (urlStr.includes('sendChatAction')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) };
      }
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1062,
        business_message: {
          message_id: 262,
          chat: { id: 11111, type: 'private' },
          from: { id: 12345 }, // Owner sending the message
          business_connection_id: 'conn_123',
          voice: { file_id: 'voice_file_49', file_size: 1000, duration: 3 }
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fetchCalled, true, 'Should process outgoing voice messages in business connection');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Duplicate concurrent business media messages are deduplicated
  // ----------------------------------------------------
  test('Duplicate concurrent business media messages are deduplicated', async () => {
    let processCount = 0;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: false } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: true, json: async () => ({ ok: true, result: { user: { id: 12345 }, can_reply: true } }) };
      }
      if (urlStr.includes('sendChatAction')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) };
      }
      if (urlStr.includes('/sendMessage')) {
        processCount++;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1063,
        business_message: {
          message_id: 263,
          chat: { id: 11111, type: 'private' },
          from: { id: 11111 },
          business_connection_id: 'conn_124',
          voice: { file_id: 'voice_file_50', file_unique_id: 'uniq_50', file_size: 1000, duration: 3 }
        }
      };
      const updateB = JSON.parse(JSON.stringify(update));
      updateB.update_id = 1064;
      updateB.business_message.business_connection_id = 'conn_125';

      // Fire two webhooks concurrently
      handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      handleWebhook(createReq(updateB, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);

      await new Promise(resolve => setTimeout(resolve, 400));
      assert.equal(processCount, 1, 'Should only send one response for duplicate concurrent webhooks');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Business message ignores gracefully when getBusinessConnection fails
  // ----------------------------------------------------
  test('Business message ignores gracefully when getBusinessConnection fails', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: false } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: false, status: 400, json: async () => ({ ok: false, description: 'BUSINESS_CONNECTION_NOT_FOUND' }) };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1065,
        business_message: {
          message_id: 264,
          chat: { id: 11111, type: 'private' },
          from: { id: 11111 },
          business_connection_id: 'conn_126',
          voice: { file_id: 'voice_file_51', file_unique_id: 'uniq_51', file_size: 1000, duration: 3 }
        }
      };
      const res = await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      assert.equal(res.status, 200, 'Webhook response should be 200 OK');
      await new Promise(resolve => setTimeout(resolve, 200));
      assertNoMessageSent();
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Business message ignores gracefully when can_reply is false
  // ----------------------------------------------------
  test('Business message ignores gracefully when can_reply is false', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: false } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: { id: 'conn_127', user: { id: 12345 }, is_enabled: true, can_reply: false }
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1066,
        business_message: {
          message_id: 265,
          chat: { id: 11111, type: 'private' },
          from: { id: 11111 },
          business_connection_id: 'conn_127',
          voice: { file_id: 'voice_file_52', file_unique_id: 'uniq_52', file_size: 1000, duration: 3 }
        }
      };
      const res = await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      assert.equal(res.status, 200, 'Webhook response should be 200 OK');
      await new Promise(resolve => setTimeout(resolve, 200));
      assertNoMessageSent();
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Guest message executing command /help uses answerGuestQuery
  // ----------------------------------------------------
  test('Guest message command /help posts nothing (quiet chat)', async () => {
    let answerGuestQueryCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345&guest=on', allowed_updates: ['message', 'business_message', 'guest_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: true } }) };
      }
      if (urlStr.includes('answerGuestQuery')) {
        answerGuestQueryCalled = true;
        const body = JSON.parse(options.body);
        assert.equal(body.guest_query_id, 'gq_123');
        assert.ok(body.result.input_message_content.message_text.includes('бот-транскрибатор') || body.result.input_message_content.message_text.includes('transcription bot'));
        return { ok: true, json: async () => ({ ok: true, result: true }) };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1067,
        guest_message: {
          message_id: 266,
          chat: { id: 98765, type: 'private' },
          from: { id: 98765 },
          text: '/help',
          entities: [{ type: 'bot_command', offset: 0, length: 5 }],
          guest_query_id: 'gq_123'
        }
      };
      const res = await handleWebhook(createReq(update, { owner: '12345', secretary: 'on', guest: 'on' }), MOCK_CONFIG, MOCK_CTX);
      assert.equal(res.status, 200, 'Webhook response should be 200 OK');
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(answerGuestQueryCalled, false, 'Quiet chat: guest commands must not be answered');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Client starting mention (@testbot) without reply gets replyRequired
  // ----------------------------------------------------
  test('Client starting mention (@testbot) without reply in secretary mode posts nothing (quiet chat)', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999 } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: true, json: async () => ({ ok: true, result: { user: { id: 11111 }, can_reply: true } }) };
      }
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
        const body = JSON.parse(options.body);
        if (body.chat_id === 98765) {
          assert.equal(body.business_connection_id, 'conn_123');
          assert.ok(body.text.includes('Используйте эту команду') || body.text.includes('reply to an audio') || body.text.includes('Use this command'));
        }
        return { ok: true, json: async () => ({ ok: true, result: true }) };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1068,
        business_message: {
          message_id: 267,
          chat: { id: 98765, type: 'private' },
          from: { id: 11111 }, // Client (sender.id !== chat.id)
          business_connection_id: 'conn_123',
          text: '@testbot',
          entities: [{ type: 'mention', offset: 0, length: 8 }]
        }
      };
      const res = await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      assert.equal(res.status, 200, 'Webhook response should be 200 OK');
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fetchCalled, false, 'Quiet chat: no replyRequired warning must be posted');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Client mentioning bot in middle of message without reply is ignored
  // ----------------------------------------------------
  test('Client mentioning bot in middle of message without reply is ignored', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999 } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: true, json: async () => ({ ok: true, result: { user: { id: 11111 }, can_reply: true } }) };
      }
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1069,
        business_message: {
          message_id: 268,
          chat: { id: 98765, type: 'private' },
          from: { id: 11111 }, // Client
          business_connection_id: 'conn_123',
          text: 'hello @testbot',
          entities: [{ type: 'mention', offset: 6, length: 8 }]
        }
      };
      const res = await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      assert.equal(res.status, 200, 'Webhook response should be 200 OK');
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fetchCalled, false, 'Should ignore mention in the middle of a message if no reply target');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Client mentioning bot in middle of message with non-audio reply is ignored
  // ----------------------------------------------------
  test('Client mentioning bot in middle of message with non-audio reply is ignored', async () => {
    let fetchCalled = false;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('getWebhookInfo')) {
        return { ok: true, json: async () => ({ ok: true, result: { url: 'https://example.com/api/webhook?owner=12345', allowed_updates: ['message', 'business_message'] } }) };
      }
      if (urlStr.includes('getMe')) {
        return { ok: true, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999 } }) };
      }
      if (urlStr.includes('getBusinessConnection')) {
        return { ok: true, json: async () => ({ ok: true, result: { user: { id: 11111 }, can_reply: true } }) };
      }
      if (urlStr.includes('/sendMessage')) {
        fetchCalled = true;
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1070,
        business_message: {
          message_id: 269,
          chat: { id: 98765, type: 'private' },
          from: { id: 11111 }, // Client
          business_connection_id: 'conn_123',
          text: 'hello @testbot',
          entities: [{ type: 'mention', offset: 6, length: 8 }],
          reply_to_message: {
            message_id: 260,
            from: { id: 98765 },
            text: 'some regular text message, no audio'
          }
        }
      };
      const res = await handleWebhook(createReq(update, { owner: '12345', secretary: 'on' }), MOCK_CONFIG, MOCK_CTX);
      assert.equal(res.status, 200, 'Webhook response should be 200 OK');
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(fetchCalled, false, 'Should ignore mention in the middle of a message even when replying to non-audio');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Quiet chat: business chats only ever get a good transcription
  // ----------------------------------------------------
  const runBusinessVoiceWithWhisper = async (updateId, whisperResponse, extraQuery = {}, chatResponse = null) => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (url.toString().includes('/audio/transcriptions')) return whisperResponse();
      if (chatResponse && url.toString().includes('/chat/completions')) {
        recordedCalls.push({ url: url.toString() });
        return chatResponse(url, options);
      }
      if (Object.keys(extraQuery).length && url.toString().includes('/getWebhookInfo')) {
        const query = new URLSearchParams({ owner: '12345', secretary: 'on', ...extraQuery });
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { url: `https://example.com/api/webhook?${query}`, allowed_updates: ['message', 'business_message'] } }) };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: updateId,
        business_message: {
          message_id: updateId,
          chat: { id: 98765, type: 'private' },
          from: { id: 98765, first_name: 'Friend' },
          business_connection_id: 'conn_123',
          voice: { file_id: `voice_quiet_${updateId}`, file_unique_id: `uq_quiet_${updateId}`, file_size: 1000, duration: 4 }
        }
      };
      await handleWebhook(createReq(update, { owner: '12345', secretary: 'on', ...extraQuery }), MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
    } finally {
      globalThis.fetch = baseFetch;
    }
  };

  test('Quiet chat: transcription error posts nothing to the business chat (owner is notified)', async () => {
    await runBusinessVoiceWithWhisper(20001, () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) }));
    const toChat = recordedCalls.filter(call => call.url.includes('/sendMessage') && String(call.json?.chat_id) === '98765');
    assert.equal(toChat.length, 0, 'No error message must reach the business chat');
    assertMessageSent('12345', /Transcription Error|boom/i);
  });

  test('Quiet chat: low-quality transcription (noise / hallucination) posts nothing', async () => {
    for (const [i, text] of [['1', '[музыка]'], ['2', 'Продолжение следует...'], ['3', 'Субтитры сделал DimaTorzok']]) {
      clearHistory();
      await runBusinessVoiceWithWhisper(20010 + Number(i), () => ({ ok: true, status: 200, json: async () => ({ text }), text: async () => JSON.stringify({ text }) }));
      assertNoMessageSent();
    }
  });

  test('Quiet chat: Whisper non-speech segments suppress the transcription', async () => {
    const body = { text: 'Ага.', segments: [{ start: 0, end: 3, no_speech_prob: 0.9, avg_logprob: -1.5 }] };
    await runBusinessVoiceWithWhisper(20021, () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }));
    assertNoMessageSent();
  });

  test('Quiet chat: good transcription is posted as italic text after the emoji', async () => {
    const body = { text: 'Привет, это нормальный голосовой.', segments: [{ start: 0, end: 3, no_speech_prob: 0.01, avg_logprob: -0.2 }] };
    await runBusinessVoiceWithWhisper(20031, () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }));
    const sent = recordedCalls.find(call => call.url.includes('/sendMessage') && String(call.json?.chat_id) === '98765');
    assert.ok(sent, 'Transcription must be posted');
    assert.equal(sent.json.text, '❇️\n\n_Привет, это нормальный голосовой\\._');
    assert.equal(sent.json.reply_to_message_id, 20031);
  });

  test('Quiet chat: the chosen transcript format (fmt) is applied to the posted reply', async () => {
    const body = { text: 'Да, записывай.', segments: [{ start: 0, end: 2, no_speech_prob: 0.01, avg_logprob: -0.2 }] };
    await runBusinessVoiceWithWhisper(20035, () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }), { fmt: 'abc' });
    const sent = recordedCalls.find(call => call.url.includes('/sendMessage') && String(call.json?.chat_id) === '98765');
    assert.ok(sent, 'Transcription must be posted');
    assert.equal(sent.json.text, '🔤 Да, записывай\\.');
  });

  test('Quiet chat: doubtful transcription goes privately to the owner, not to the chat', async () => {
    const body = { text: 'Кажется, речь про встречу завтра.', segments: [{ start: 0, end: 3, no_speech_prob: 0.1, avg_logprob: -0.9, compression_ratio: 1.5 }] };
    await runBusinessVoiceWithWhisper(20041, () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }));
    const toChat = recordedCalls.filter(call => call.url.includes('/sendMessage') && String(call.json?.chat_id) === '98765');
    assert.equal(toChat.length, 0, 'Doubtful transcription must not reach the business chat');
    // Goes to the connected business account owner (mock connection user 11111)
    assertMessageSent('11111', /🤔[\s\S]*встречу завтра/);
  });

  // Output modes: Groq chat completions are mocked by request kind (cleanup vs JSON insights)
  const chatMock = ({ polished, insights }) => async (url, options) => {
    const req = JSON.parse(options.body);
    const content = req.response_format ? JSON.stringify(insights) : polished;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => content };
  };
  const longText = 'ну вот смотри '.repeat(30) + 'что думаешь';
  const longBody = { text: longText, segments: [{ start: 0, end: 30, no_speech_prob: 0.01, avg_logprob: -0.2 }] };
  const whisperLong = () => ({ ok: true, status: 200, json: async () => longBody, text: async () => JSON.stringify(longBody) });
  const sentTo = (chatId) => recordedCalls.filter(call => call.url.includes('/sendMessage') && String(call.json?.chat_id) === chatId);

  test('Output modes: polished transcript to chat, summary and replies privately to the account owner', async () => {
    const polished = 'Смотри. ' + 'Смотри, '.repeat(30) + 'что думаешь?';
    await runBusinessVoiceWithWhisper(20051, whisperLong, {}, chatMock({ polished, insights: { summary: '🤝 **Тема**\n- **Суть:** проверка', replies: ['Ответ один', 'Ответ два', 'Ответ три'] } }));
    const toChat = sentTo('98765');
    assert.equal(toChat.length, 1, 'Only the transcript goes into the conversation');
    assert.match(toChat[0].json.text, /что думаешь\?/);
    const toOwner = sentTo('11111').map(c => c.json.text);
    assert.ok(toOwner.some(t => /📝/.test(t) && /\*Тема\*/.test(t)), 'Summary sent privately with single-asterisk bold');
    assert.ok(toOwner.some(t => /💬/.test(t) && /```\nОтвет два\n```/.test(t)), 'Reply options sent as copyable code blocks');
  });

  test('Output modes: switched off summary/replies and transcript-to-chat', async () => {
    await runBusinessVoiceWithWhisper(20052, whisperLong, { sum: 'off', rep: 'off', tr: 'off', polish: 'off' }, chatMock({ polished: 'X', insights: { summary: 'S', replies: ['R'] } }));
    assert.equal(sentTo('98765').length, 0, 'Transcript-to-chat is off');
    const toOwner = sentTo('11111').map(c => c.json.text);
    assert.equal(toOwner.length, 1, 'Owner gets only the transcript');
    assert.match(toOwner[0], /ну вот смотри/, 'Polish off keeps the raw text');
    assert.ok(!recordedCalls.some(c => c.url.includes('/chat/completions')), 'No LLM calls when all extras are off');
  });

  test('Output modes: cleanup that drifts in length falls back to the raw transcript', async () => {
    await runBusinessVoiceWithWhisper(20053, whisperLong, { sum: 'off', rep: 'off' }, chatMock({ polished: 'Коротко.', insights: {} }));
    assert.match(sentTo('98765')[0].json.text, /ну вот смотри/);
  });
});
