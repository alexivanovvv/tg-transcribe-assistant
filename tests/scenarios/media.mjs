import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook } from '../../lib/core.js';
import { getMarkdown } from '../../lib/localize.js';
import {
  MOCK_CONFIG,
  MOCK_CTX,
  createReq,
  clearHistory,
  assertMessageSent,
  setupFetchMock,
  recordedCalls
} from './helper.mjs';

describe('Media Scenarios', () => {
  before(() => setupFetchMock());
  afterEach(() => clearHistory());

  // ----------------------------------------------------
  // Transcription Error triggers notify_err
  // ----------------------------------------------------
  test('Transcription API error sends alert to owner and user', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/audio/transcriptions')) {
        return { ok: false, status: 500, statusText: 'Internal Server Error', text: async () => 'API is down' };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1012,
        message: {
          message_id: 212,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          voice: { file_id: 'voice_err', file_size: 1000, duration: 5 }
        }
      };
      // User is 12345, owner is 99999
      const req = createReq(update, { owner: '99999', notify_err: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      // Check reply to user
      assertMessageSent('12345', /API is down/i);
      // Check alert to owner
      assertMessageSent('99999', /Transcription Error/i);
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // /prompt as caption to a voice message — overrides prompt (Case 2: file in same msg)
  // ----------------------------------------------------
  test('/prompt as caption to voice message overrides prompt and transcribes', async () => {
    const update = {
      update_id: 1019,
      message: {
        message_id: 219,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_19', file_size: 1000, duration: 5 },
        caption: '/prompt my custom prompt'
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called Groq transcriptions API');
    assert.equal(transcriptionCall.formData?.prompt, 'my custom prompt', 'Should pass caption prompt override');
    // Case 2: reply cites the same message (219) that contains the file
    const replyCall = recordedCalls.find(c => c.url.includes('/sendMessage') && c.json?.reply_to_message_id);
    assert.ok(replyCall, 'Should have called sendMessage with reply_to_message_id');
    assert.equal(replyCall.json.reply_to_message_id, 219, 'Bot must cite the voice message itself (case 2)');
  });

  // ----------------------------------------------------
  // /prompt command (without text) as reply to voice — overrides with empty string
  // ----------------------------------------------------
  test('/prompt command (without text) as reply to voice message overrides default prompt with empty string', async () => {
    const update = {
      update_id: 1020,
      message: {
        message_id: 220,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        text: '/prompt',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
        reply_to_message: {
          message_id: 201,
          from: { id: 55555 },
          voice: { file_id: 'voice_file_20', file_size: 1000, duration: 5 }
        }
      }
    };
    const req = createReq(update, { owner: '12345', prompt: 'default_val' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called Groq transcriptions API');
    assert.ok(!transcriptionCall.formData?.prompt, 'Should pass empty prompt override');
  });

  // ----------------------------------------------------
  // Non-owner uses /prompt as text reply to a voice message (Case 1)
  // ----------------------------------------------------
  test('Non-owner /prompt as reply to voice — cites voice message, not command message', async () => {
    const update = {
      update_id: 1021,
      message: {
        message_id: 221,
        chat: { id: 99999, type: 'private' },
        from: { id: 99999 },
        text: '/prompt guest override prompt',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
        reply_to_message: {
          message_id: 201,
          from: { id: 55555 },
          voice: { file_id: 'voice_file_21', file_size: 1000, duration: 5 }
        }
      }
    };
    const req = createReq(update, { owner: '12345', guest: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('99999', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called Groq transcriptions API');
    assert.equal(transcriptionCall.formData?.prompt, 'guest override prompt', 'Should pass guest override');
    // Case 1: bot must cite the VOICE message (201), not the /prompt command message (221)
    const replyCall = recordedCalls.find(c => c.url.includes('/sendMessage') && c.json?.reply_to_message_id);
    assert.ok(replyCall, 'Should have called sendMessage with reply_to_message_id');
    assert.equal(replyCall.json.reply_to_message_id, 201, 'Bot must cite the voice message (case 1), not the command message');
  });

  // ----------------------------------------------------
  // /prompt with text but NO audio — must NOT change settings
  // ----------------------------------------------------
  test('/prompt text-only (no audio) responds with noAudio, does not change settings', async () => {
    const update = {
      update_id: 1022,
      message: {
        message_id: 222,
        chat: { id: 99999, type: 'private' },
        from: { id: 99999, language_code: 'en' },
        text: '/prompt this should not change the system prompt',
        entities: [{ type: 'bot_command', offset: 0, length: 7 }]
      }
    };
    const req = createReq(update, { owner: '12345', guest: 'on' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('99999', /in reply to/i);
    assert.ok(!recordedCalls.find(c => c.url.includes('/setWebhook')), 'Should NOT call setWebhook');
    assert.ok(!recordedCalls.find(c => c.url.includes('/audio/transcriptions')), 'Should NOT call transcription API');
  });

  // ----------------------------------------------------
  // No WHISPER_PROMPT env → settings.prompt=undefined → no prompt field sent to API
  // ----------------------------------------------------
  test('No WHISPER_PROMPT env + settings.prompt=undefined → Whisper called without prompt', async () => {
    const update = {
      update_id: 1023,
      message: {
        message_id: 223,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_23', file_size: 1000, duration: 5 }
      }
    };
    const configNoEnvPrompt = { ...MOCK_CONFIG, whisperPrompt: undefined };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, configNoEnvPrompt, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called transcription API');
    assert.ok(!transcriptionCall.formData?.prompt, 'Should NOT send prompt field when no env and no setting');
  });

  // ----------------------------------------------------
  // WHISPER_PROMPT env set + settings.prompt=undefined → env prompt used as default
  // ----------------------------------------------------
  test('WHISPER_PROMPT env set + settings.prompt=undefined → env prompt is sent to API', async () => {
    const update = {
      update_id: 1024,
      message: {
        message_id: 224,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_24', file_size: 1000, duration: 5 }
      }
    };
    const configWithEnvPrompt = { ...MOCK_CONFIG, whisperPrompt: 'Multilingual: Привет Hello' };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, configWithEnvPrompt, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called transcription API');
    assert.equal(transcriptionCall.formData?.prompt, 'Multilingual: Привет Hello', 'Should use WHISPER_PROMPT env as default');
  });

  // ----------------------------------------------------
  // Unsupported Video Container Rejection (Should Warn)
  // ----------------------------------------------------
  test('Private chat unsupported video (MOV document) replies with Unsupported Video format warning', async () => {
    const update = {
      update_id: 1025,
      message: {
        message_id: 225,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        document: { file_id: 'mov_file_id', mime_type: 'video/quicktime', file_name: 'video.mov', file_size: 5000 }
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /Unsupported video format/i);
  });

  // ----------------------------------------------------
  // Supported Video Container Processing (Should Transcribe)
  // ----------------------------------------------------
  test('Private chat supported video (MP4 video) transcribes successfully', async () => {
    const update = {
      update_id: 1026,
      message: {
        message_id: 226,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        video: { file_id: 'mp4_file_id', mime_type: 'video/mp4', file_name: 'video.mp4', file_size: 5000 }
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called transcription API');
  });

  // ----------------------------------------------------
  // Native FLAC Support (Should Transcribe)
  // ----------------------------------------------------
  test('Private chat FLAC document transcribes successfully', async () => {
    const update = {
      update_id: 1027,
      message: {
        message_id: 227,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        document: { file_id: 'flac_file_id', mime_type: 'audio/flac', file_name: 'song.flac', file_size: 5000 }
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /transcription/i);
  });

  // ----------------------------------------------------
  // Native OPUS Document (Should Transcribe)
  // ----------------------------------------------------
  test('Private chat OPUS document (application/octet-stream) transcribes successfully', async () => {
    const update = {
      update_id: 10275,
      message: {
        message_id: 2275,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        document: { file_id: 'opus_file_id', mime_type: 'application/octet-stream', file_name: 'audio.opus', file_size: 5000 }
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));
    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions') && c.formData?.file?.name === 'audio.ogg');
    assert.ok(transcriptionCall, 'Should have called transcription API with normalized .ogg file');
  });

  // ----------------------------------------------------
  // Forwarded message with /prompt in caption — caption must be IGNORED (Case 3)
  // ----------------------------------------------------
  test('Forwarded voice with /prompt caption — caption ignored (Case 3: forwarded)', async () => {
    const update = {
      update_id: 1028,
      message: {
        message_id: 228,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        forward_from: { id: 55555, first_name: 'Someone' },
        voice: { file_id: 'voice_file_28', file_size: 1000, duration: 5 },
        caption: '/prompt forwarded caption prompt'
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called transcription API');
    assert.ok(
      transcriptionCall.formData?.prompt !== 'forwarded caption prompt',
      'Forwarded message caption must NOT be used as /prompt command (Case 3)'
    );
  });

  // ----------------------------------------------------
  // Multiline prompt saved in webhook URL — must NOT be double-encoded
  // ----------------------------------------------------
  test('Multiline saved prompt survives URLSearchParams round-trip without double-encoding', async () => {
    const multilinePromptSaved = 'term one\nterm two\nterm three';
    const savedParams = new URLSearchParams();
    savedParams.set('owner', '12345');
    savedParams.set('prompt', multilinePromptSaved);

    const parsedForTest = Object.fromEntries(new URLSearchParams(savedParams.toString()));
    assert.equal(
      parsedForTest.prompt,
      multilinePromptSaved,
      'URLSearchParams round-trip must not double-encode: decoded value must equal original'
    );

    const update = {
      update_id: 1029,
      message: {
        message_id: 229,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        voice: { file_id: 'voice_file_29', file_size: 1000, duration: 5 }
      }
    };
    const req = createReq(update, Object.fromEntries(new URLSearchParams(savedParams.toString())));
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called transcription API');
    assert.equal(
      transcriptionCall.formData?.prompt,
      multilinePromptSaved,
      'Multiline saved prompt must arrive at Whisper with newlines intact (no %0A literals)'
    );
  });

  // ----------------------------------------------------
  // Multiline /prompt as text reply to a voice message
  // ----------------------------------------------------
  test('Multiline /prompt as text reply to voice message preserves newlines to Whisper API', async () => {
    const multilineReplyPrompt = 'много\nстрочный\nпромпт';
    const update = {
      update_id: 1030,
      message: {
        message_id: 230,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345 },
        text: `/prompt ${multilineReplyPrompt}`,
        entities: [{ type: 'bot_command', offset: 0, length: 7 }],
        reply_to_message: {
          message_id: 201,
          from: { id: 55555 },
          voice: { file_id: 'voice_file_30', file_size: 1000, duration: 5 }
        }
      }
    };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    assertMessageSent('12345', /transcription/i);
    const transcriptionCall = recordedCalls.find(c => c.url.includes('/audio/transcriptions'));
    assert.ok(transcriptionCall, 'Should have called transcription API');
    assert.equal(
      transcriptionCall.formData?.prompt,
      multilineReplyPrompt,
      'Multiline /prompt as reply must reach Whisper API with newlines intact'
    );
  });

  // ----------------------------------------------------
  // Systemic sendReply MarkdownV2 Formatting Failure (throws and notifies)
  // ----------------------------------------------------
  test('Systemic sendReply MarkdownV2 Formatting Failure triggers owner notification', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage') && options.body && options.body.includes('"chat_id":12345') && !options.body.includes('Critical Bot Error')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: false,
            error_code: 400,
            description: "Bad Request: can't parse entities: Character '(' is reserved and must be escaped with the preceding backslash"
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1031,
        message: {
          message_id: 231,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          voice: { file_id: 'voice_file_31', file_size: 1000, duration: 5 }
        }
      };
      const req = createReq(update, { owner: '12345', notify_err: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assertMessageSent('12345', /Critical Bot Error/i);
      assertMessageSent('12345', /Telegram delivery failed/i);
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // User-space sendReply Block Failure (silent)
  // ----------------------------------------------------
  test('User-space sendReply Block Failure does not notify owner', async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage') && options.body && options.body.includes('"chat_id":12345') && !options.body.includes('Critical Bot Error')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: false,
            error_code: 403,
            description: 'Forbidden: bot was blocked by the user'
          })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1032,
        message: {
          message_id: 232,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          voice: { file_id: 'voice_file_32', file_size: 1000, duration: 5 }
        }
      };
      const req = createReq(update, { owner: '12345', notify_err: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      const notifications = recordedCalls.filter(call =>
        call.url.includes('/sendMessage') &&
        call.json?.text &&
        call.json.text.includes('Critical Bot Error')
      );
      assert.equal(notifications.length, 0, 'Should not notify the owner for user-space errors');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Sequential Chunking for Long Transcriptions (>3000 chars)
  // ----------------------------------------------------
  test('Very long transcription splits into sequential chunks', async () => {
    const longText = 'A'.repeat(3500) + '\n' + 'B'.repeat(1500); // 5001 characters total
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/audio/transcriptions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ text: longText }),
          text: async () => JSON.stringify({ text: longText })
        };
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1033,
        message: {
          message_id: 233,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          voice: { file_id: 'voice_file_33', file_size: 1000, duration: 5 }
        }
      };
      const req = createReq(update, { owner: '12345', verbose: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      const replies = recordedCalls.filter(call => call.url.includes('/sendMessage') && call.json?.chat_id === 12345);
      assert.equal(replies.length, 2, 'Should send exactly 2 reply messages');

      const chunk1Text = replies[0].json.text;
      assert.ok(chunk1Text.includes('1/2'), 'Chunk 1 should include 1/2 pagination');
      assert.ok(!chunk1Text.includes('Info: '), 'Chunk 1 should NOT include the verbose info footer');
      assert.ok(chunk1Text.includes('🎤 *Transcription:*'), 'Chunk 1 should have standard header');

      const chunk2Text = replies[1].json.text;
      assert.ok(chunk2Text.includes('2/2'), 'Chunk 2 should include 2/2 pagination');
      assert.ok(chunk2Text.includes('⚙️'), 'Chunk 2 should include the verbose info footer');
      assert.ok(chunk2Text.includes('🎤 *Transcription:*'), 'Chunk 2 should have standard header');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // sendReply Formatting Fallback (recovers as plain text)
  // ----------------------------------------------------
  test('MarkdownV2 formatting error triggers plain-text send fallback', async () => {
    const baseFetch = globalThis.fetch;
    let sendCount = 0;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage')) {
        sendCount++;
        if (sendCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: false,
              error_code: 400,
              description: "Bad Request: can't parse entities: Character '(' is reserved"
            })
          };
        } else {
          const parsed = JSON.parse(options.body);
          assert.equal(parsed.parse_mode, undefined, 'Fallback attempt must NOT include parse_mode');
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 888 } })
          };
        }
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1034,
        message: {
          message_id: 234,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          voice: { file_id: 'voice_file_34', file_size: 1000, duration: 5 }
        }
      };
      const req = createReq(update, { owner: '12345' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(sendCount, 2, 'Should have retried sending once (2 total sends)');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Deleted Voice Message (Silent ignore)
  // ----------------------------------------------------
  test('Deleted voice message error is ignored silently', async () => {
    const baseFetch = globalThis.fetch;
    let errorNotificationSent = false;
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendMessage')) {
        const parsed = JSON.parse(options.body);
        if (parsed.reply_to_message_id) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: false,
              error_code: 400,
              description: 'Bad Request: reply message not found'
            })
          };
        } else if (parsed.text.toLowerCase().includes('error') || parsed.text.toLowerCase().includes('ошибка')) {
          errorNotificationSent = true;
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 999 } })
          };
        }
      }
      return baseFetch(url, options);
    };
    try {
      const update = {
        update_id: 1035,
        message: {
          message_id: 235,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          voice: { file_id: 'voice_file_35', file_size: 1000, duration: 5 }
        }
      };
      const req = createReq(update, { owner: '12345' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(errorNotificationSent, false, 'No error notification should be sent for deleted message');
    } finally {
      globalThis.fetch = baseFetch;
    }
  });

  // ----------------------------------------------------
  // Missing WHISPER_API_KEY prepends warning (unsupported video format)
  // ----------------------------------------------------
  test('Missing WHISPER_API_KEY prepends warning to sendReply updates (unsupported video)', async () => {
    const update = {
      update_id: 1036,
      message: {
        message_id: 236,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, language_code: 'en' },
        video: { file_id: 'video_file_36', mime_type: 'video/avi', duration: 10 }
      }
    };
    const configNoWhisper = { ...MOCK_CONFIG, whisperApiKey: undefined };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, configNoWhisper, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    const replyCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
    assert.ok(replyCall, 'Should reply to user');
    assert.ok(replyCall.json.text.includes('API Key is not configured'), 'Should contain API key missing warning');
    assert.ok(replyCall.json.text.includes('Unsupported video format'), 'Should contain unsupported video message');
  });

  // ----------------------------------------------------
  // Missing WHISPER_API_KEY responds with warning only on voice messages
  // ----------------------------------------------------
  test('Missing WHISPER_API_KEY responds with warning only on voice messages', async () => {
    const update = {
      update_id: 1037,
      message: {
        message_id: 237,
        chat: { id: 12345, type: 'private' },
        from: { id: 12345, language_code: 'en' },
        voice: { file_id: 'voice_file_37', file_size: 1000, duration: 5 }
      }
    };
    const configNoWhisper = { ...MOCK_CONFIG, whisperApiKey: undefined };
    const req = createReq(update, { owner: '12345' });
    await handleWebhook(req, configNoWhisper, MOCK_CTX);
    await new Promise(resolve => setTimeout(resolve, 50));

    const replyCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
    assert.ok(replyCall, 'Should reply to user');
    assert.equal(
      replyCall.json.text,
      getMarkdown('en', 'apiKeyMissing', { key: 'WHISPER_API_KEY' }),
      'Should contain ONLY API key missing warning without duplication'
    );
  });
});
