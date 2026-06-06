import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { transcribeAudio, DEFAULT_API_BASE, DEFAULT_WHISPER_MODEL } from '../../lib/transcriber.js';

describe('Bot unit_transcriber', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const baseConfig = {
    telegramBotToken: 'mock-bot-token',
    whisperApiKey: 'mock-whisper-key',
    whisperApiBase: DEFAULT_API_BASE,
  };

  const baseSettings = {
    lang: 'auto',
    model: DEFAULT_WHISPER_MODEL
  };

  test('getFile failure returns error object', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({ ok: false, error: 'File not found' }), { status: 404 });
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('invalid-file-id', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('File not found') || res.error.includes('Failed to get file info'));
  });

  test('unsupported video format extensions are rejected early', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'video/file.mov', file_size: 1000 }
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('file-123', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'UNSUPPORTED_VIDEO_FORMAT');
  });

  test('non-native format > 5MB triggers range check', async () => {
    let rangeHeaderUsed = false;
    globalThis.fetch = async (url, options) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'audio/recording.xyz', file_size: 6 * 1024 * 1024 }
        }), { status: 200 });
      }
      if (options?.headers?.Range) {
        rangeHeaderUsed = true;
        // Return valid AAC magic bytes in range response
        return new Response(new Uint8Array([0xFF, 0xF1, 0x00, 0x00]), { status: 206 });
      }
      if (url.includes('file/bot')) {
        // Return full AAC stream
        return new Response(new Uint8Array([0xFF, 0xF1, 0x10, 0x40, 0x00, 0x00, 0x00, 0x11, 0x22]));
      }
      if (url.includes('/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: 'Hello world.' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('file-large', baseConfig, baseSettings);
    assert.equal(rangeHeaderUsed, true);
    assert.equal(res.ok, true);
    assert.equal(res.text, 'Hello world.');
  });

  test('non-native format with failed range check aborts early', async () => {
    globalThis.fetch = async (url, options) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'audio/recording.xyz', file_size: 6 * 1024 * 1024 }
        }), { status: 200 });
      }
      if (options?.headers?.Range) {
        // Return unrecognized bytes
        return new Response(new Uint8Array([0x00, 0x00, 0x00, 0x00]), { status: 206 });
      }
      if (url.includes('file/bot')) {
        return new Response(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('file-xyz', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'UNSUPPORTED_AUDIO_FORMAT');
  });

  test('Telegram file download HTTP failure returns error', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'voice/audio.ogg', file_size: 500 }
        }), { status: 200 });
      }
      if (url.includes('file/bot')) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('file-404', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('Telegram file download HTTP status 404'));
  });

  test('Unsupported non-native format extension returns error', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'file.unknownext', file_size: 100 }
        }), { status: 200 });
      }
      if (url.includes('file/bot')) {
        return new Response(new Uint8Array([0x12, 0x34, 0x56]));
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('file-unknown', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'UNSUPPORTED_AUDIO_FORMAT');
  });

  test('Whisper API HTTP error returns error description', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'voice/audio.mp3', file_size: 500 }
        }), { status: 200 });
      }
      if (url.includes('file/bot')) {
        return new Response(new Uint8Array([0x49, 0x44, 0x33])); // MP3 magic header
      }
      if (url.includes('/audio/transcriptions')) {
        return new Response('Unauthorized API key', { status: 401 });
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('file-mp3', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('Transcription API HTTP 401: Unauthorized API key'));
  });

  test('Whisper API returning empty text returns error', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'voice/audio.ogg', file_size: 500 }
        }), { status: 200 });
      }
      if (url.includes('file/bot')) {
        return new Response(new Uint8Array([0x4F, 0x67, 0x67, 0x53])); // OggS magic
      }
      if (url.includes('/audio/transcriptions')) {
        return new Response(JSON.stringify({ text: '' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const res = await transcribeAudio('file-empty-res', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('empty response'));
  });

  test('Language, prompt overrides, and text post-processing (formatting dashes and sentences)', async () => {
    let sentFormData = null;
    globalThis.fetch = async (url, options) => {
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: 'voice/audio.wav', file_size: 500 }
        }), { status: 200 });
      }
      if (url.includes('file/bot')) {
        return new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46])); // RIFF header
      }
      if (url.includes('/audio/transcriptions')) {
        sentFormData = options.body;
        return new Response(JSON.stringify({
          text: 'Hello world. — How are you? Fine thanks.'
        }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const settingsWithLang = { lang: 'ru', model: 'whisper-large-v3', prompt: 'Context prompt' };
    const res = await transcribeAudio('file-wav', baseConfig, settingsWithLang, 'Override prompt');

    assert.equal(res.ok, true);
    assert.equal(res.language, 'ru');
    assert.equal(sentFormData.get('language'), 'ru');
    assert.equal(sentFormData.get('prompt'), 'Override prompt');
    assert.ok(res.text.includes('\n— How are you?'));
    assert.ok(res.text.includes('Hello world.\n'));
  });

  test('Internal exception during fetch is caught gracefully', async () => {
    globalThis.fetch = async () => {
      throw new Error('Network timeout failure');
    };

    const res = await transcribeAudio('file-net-err', baseConfig, baseSettings);
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('Network timeout failure'));
  });
});
