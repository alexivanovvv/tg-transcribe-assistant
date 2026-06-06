import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook } from '../../lib/core.js';
import {
  MOCK_CONFIG,
  MOCK_CTX,
  createReq,
  clearHistory,
  assertMessageSent,
  assertNoMessageSent,
  setupFetchMock
} from './helper.mjs';

describe('Core Scenarios', () => {
  before(() => setupFetchMock());
  afterEach(() => clearHistory());

  // ----------------------------------------------------
  // Private Chat Voice Message (Should Transcribe)
  // ----------------------------------------------------
  test('Private chat voice message transcribes and replies', async () => {
    const update = {
      update_id: 1001,
      message: {
        message_id: 201,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, is_bot: false, first_name: 'Tester' },
        voice: { file_id: 'voice_file_123', file_size: 1000, duration: 5 }
      }
    };

    const req = createReq(update, { owner: '12345' });
    const res = await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    assert.equal(res.status, 200, 'Webhook response should be 200 OK');

    // Allow async waitUntil task to finish
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', 'mock voice transcription');
  });

  // ----------------------------------------------------
  // Private Chat Unsupported Document (Should Warn)
  // ----------------------------------------------------
  test('Private chat zip document replies with Unsupported Format warning', async () => {
    const update = {
      update_id: 1002,
      message: {
        message_id: 202,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        document: { file_id: 'doc_file_123', mime_type: 'application/zip', file_name: 'archive.zip', file_size: 5000 }
      }
    };

    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', 'Unsupported file format');
  });

  // ----------------------------------------------------
  // Group Chat Message without Mention (Should Ignore)
  // ----------------------------------------------------
  test('Group chat text message without bot mention is ignored', async () => {
    const update = {
      update_id: 1005,
      message: {
        message_id: 205,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        text: 'Hello group'
      }
    };

    const req = createReq(update, { owner: '12345', groups: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertNoMessageSent();
  });

  // ----------------------------------------------------
  // Group Chat Message with Mention (Should Transcribe)
  // ----------------------------------------------------
  test('Group chat voice message with bot mention gets transcribed', async () => {
    const update = {
      update_id: 1006,
      message: {
        message_id: 206,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        voice: { file_id: 'voice_file_555', file_size: 1000, duration: 3 },
        entities: [{ type: 'mention', offset: 0, length: 14 }],
        text: '@tg_transcribot' // contains mention
      }
    };

    const req = createReq(update, { owner: '12345', groups: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('-55555', 'mock voice transcription');
  });

  // ----------------------------------------------------
  // Critical Webhook Handler Exception
  // ----------------------------------------------------
  test('Critical exception in webhook loop is caught and reported', async () => {
    // Deliberately malformed update to cause a TypeError (missing chat object)
    const update = {
      update_id: 1007,
      message: {
        message_id: 207,
        from: { id: 12345 }
        // chat is missing
      }
    };
    const req = createReq(update, { owner: '12345' });
    const res = await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    assert.equal(res.status, 200, 'Webhook response must be 200 OK even on critical internal errors');
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /Critical Bot Error|Cannot read properties/i);
  });

  // ----------------------------------------------------
  // Dynamic Owner Registration (Fresh Deployment)
  // ----------------------------------------------------
  test('Private message triggers dynamic owner registration when owner is missing', async () => {
    const update = {
      update_id: 1009,
      message: {
        message_id: 209,
        chat: { id: 77777, type: 'private' },
        from: { id: 77777, language_code: 'en' },
        text: 'Hello bot'
      }
    };
    // No owner in query
    const req = createReq(update, {});
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 200));
    assertMessageSent('77777', /Welcome/i);
  });

  // ----------------------------------------------------
  // Allowed Owner Validation on Dynamic Owner Registration
  // ----------------------------------------------------
  test('Dynamic owner registration constraints (allowedOwner)', async () => {
    const configWithAllowedId = { ...MOCK_CONFIG, allowedOwner: '99999' };

    // Part 1: Unauthorized user sends a message -> should be ignored
    const unauthUpdate = {
      update_id: 9991,
      message: {
        message_id: 219,
        chat: { id: 77777, type: 'private' },
        from: { id: 77777, username: 'some_user', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(unauthUpdate, {}), configWithAllowedId, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertNoMessageSent();

    // Part 2: Authorized user sends a message -> should register
    clearHistory();
    const authUpdate = {
      update_id: 9992,
      message: {
        message_id: 220,
        chat: { id: 99999, type: 'private' },
        from: { id: 99999, username: 'allowed_user', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(authUpdate, {}), configWithAllowedId, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('99999', /Welcome/i);

    // Part 3: Configure allowedOwner by username — unauthorized
    clearHistory();
    const configWithAllowedUser = { ...MOCK_CONFIG, allowedOwner: '@john_doe' };
    const unauthByUsername = {
      update_id: 9993,
      message: {
        message_id: 221,
        chat: { id: 77777, type: 'private' },
        from: { id: 77777, username: 'bob', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(unauthByUsername, {}), configWithAllowedUser, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertNoMessageSent();

    // Part 4: Authorized user by username -> should register
    clearHistory();
    const authByUsername = {
      update_id: 9994,
      message: {
        message_id: 222,
        chat: { id: 88888, type: 'private' },
        from: { id: 88888, username: 'john_doe', language_code: 'en' },
        text: 'Hello bot'
      }
    };
    await handleWebhook(createReq(authByUsername, {}), configWithAllowedUser, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('88888', /Welcome/i);
  });

  // ----------------------------------------------------
  // Group — @mention + reply with audio → reply audio IS picked up
  // ----------------------------------------------------
  test('Group @mention + reply with audio — reply audio IS transcribed (isMentioned unlocks canPickReplyAudio)', async () => {
    const update = {
      update_id: 1010,
      message: {
        message_id: 210,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        text: '@tg_transcribot',
        entities: [{ type: 'mention', offset: 0, length: 15 }],
        reply_to_message: {
          message_id: 200,
          from: { id: 44444 },
          voice: { file_id: 'voice_reply_10', file_size: 1000, duration: 5 }
        }
      }
    };
    const req = createReq(update, { owner: '12345', groups: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    // @mention in group unlocks reply-audio pickup — should transcribe the reply
    assertMessageSent('-55555', 'mock voice transcription');
  });

  // ----------------------------------------------------
  // Group — @mention + direct audio in same message → DOES transcribe
  // ----------------------------------------------------
  test('Group @mention + direct voice in same message — transcribes (direct audio always processed)', async () => {
    const update = {
      update_id: 1011,
      message: {
        message_id: 211,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        voice: { file_id: 'voice_direct_11', file_size: 1000, duration: 3 },
        text: '@tg_transcribot',
        entities: [{ type: 'mention', offset: 0, length: 15 }]
      }
    };
    const req = createReq(update, { owner: '12345', groups: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('-55555', 'mock voice transcription');
  });

  // ----------------------------------------------------
  // Group — @mention only (no audio, no reply) → replyRequired
  // ----------------------------------------------------
  test('Group @mention only (no audio, no reply) — sends replyRequired (mirrors 11b)', async () => {
    const update = {
      update_id: 10111,
      message: {
        message_id: 2111,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        text: '@tg_transcribot',
        entities: [{ type: 'mention', offset: 0, length: 15 }]
      }
    };
    const req = createReq(update, { owner: '12345', groups: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('-55555', /in reply to/i);
  });

  // ----------------------------------------------------
  // Group — @mention + reply with NO audio → noAudio
  // ----------------------------------------------------
  test('Group @mention + reply with no audio — sends noAudio warning', async () => {
    const update = {
      update_id: 10112,
      message: {
        message_id: 2112,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555 },
        text: '@tg_transcribot',
        entities: [{ type: 'mention', offset: 0, length: 15 }],
        reply_to_message: {
          message_id: 2100,
          from: { id: 44444 },
          text: 'just a text message, no audio'
        }
      }
    };
    const req = createReq(update, { owner: '12345', groups: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('-55555', /no audio/i);
  });

  // ----------------------------------------------------
  // Group — /process without reply → sends replyRequired warning
  // ----------------------------------------------------
  test('Group /process without reply — sends replyRequired warning', async () => {
    const update = {
      update_id: 10110,
      message: {
        message_id: 2110,
        chat: { id: -55555, type: 'group', title: 'Group Chat' },
        from: { id: 55555, language_code: 'en' },
        text: '/process',
        entities: [{ type: 'bot_command', offset: 0, length: 8 }]
      }
    };
    const req = createReq(update, { owner: '12345', groups: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    // Should send replyRequired (not noAudio — that branch requires reply_to_message to exist)
    assertMessageSent('-55555', /in reply to/i);
  });
});
