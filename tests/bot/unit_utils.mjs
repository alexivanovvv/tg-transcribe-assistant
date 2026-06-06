import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  truncateTokensFromLeft,
  formatUserMarkdown
} from '../../lib/utils.js';
import { getAvailableModels } from '../../lib/menus.js';
import { createConfig } from '../../lib/core.js';
import {
  isAdtsAac,
  detectAudioFormat,
  wrapAacInWav,
  wrapCafInWav,
  wrapRawAudioInWav
} from '../../lib/wav-wrapper.js';
import { isUnsupportedVideoFile } from '../../lib/transcriber.js';

describe('Bot unit_utils', () => {

  test('Whisper token estimation', () => {
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('abc'), 1);
    assert.equal(estimateTokens('hello world'), 3);
    assert.equal(estimateTokens('Привет, мир!'), 6);

    // Left truncation
    const text = 'abcdefgh'; // 8 chars -> 2 tokens
    assert.equal(truncateTokensFromLeft(text, 1), 'efgh');
    assert.equal(truncateTokensFromLeft(text, 0.5), 'gh');
    assert.equal(truncateTokensFromLeft('', 5), '');
    assert.equal(truncateTokensFromLeft(null, 5), '');
  });

  test('createConfig parsing', () => {
    const env = {
      TELEGRAM_BOT_TOKEN: 'token-123',
      WHISPER_API_KEY: 'whisper-key',
      BOT_VERSION: '3.4.5'
    };
    const config = createConfig(env);
    assert.equal(config.telegramBotToken, 'token-123');
    assert.equal(config.whisperApiKey, 'whisper-key');
    assert.equal(config.version, '3.4.5');
  });

  test('ADTS-AAC and raw audio detectors & wrappers', () => {
    assert.equal(isAdtsAac(null), false);
    assert.equal(isAdtsAac(new Uint8Array([])), false);
    assert.equal(isAdtsAac(new Uint8Array([0xFF, 0xF1])), true);
    assert.equal(isAdtsAac(new Uint8Array([0xFF, 0xE1])), false);

    // detectAudioFormat magic bytes
    assert.equal(detectAudioFormat(new Uint8Array([0x23, 0x21, 0x41, 0x4D, 0x52, 0x0A])), 'amr-nb');
    assert.equal(detectAudioFormat(new Uint8Array([0x23, 0x21, 0x41, 0x4D, 0x52, 0x2D, 0x57, 0x42, 0x0A])), 'amr-wb');
    assert.equal(detectAudioFormat(new Uint8Array([0x63, 0x61, 0x66, 0x66])), 'caf');
    assert.equal(detectAudioFormat(new Uint8Array([0xFF, 0xF1, 0x00, 0x00])), 'aac');

    // detectAudioFormat extension-based fallbacks
    assert.equal(detectAudioFormat(new Uint8Array([0x20, 0x00, 0x00]), 'file.gsm'), 'gsm');
    assert.equal(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00]), 'file.gsm'), null); // wrong magic byte for gsm
    assert.equal(detectAudioFormat(new Uint8Array([0x20, 0x00, 0x00]), 'file.wav'), null); // wrong extension
    assert.equal(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00]), 'file.alaw'), 'alaw');
    assert.equal(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00]), 'file.al'), 'alaw');
    assert.equal(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00]), 'file.ulaw'), 'mulaw');
    assert.equal(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00]), 'file.ul'), 'mulaw');
    assert.equal(detectAudioFormat(new Uint8Array([0x00, 0x00, 0x00]), 'file.mulaw'), 'mulaw');

    // wrapAacInWav
    const validAdts = new Uint8Array([0xFF, 0xF1, 0x10, 0x40, 0x00, 0x00, 0x00, 0x11, 0x22]);
    const wavBytes = wrapAacInWav(validAdts);
    assert.equal(wavBytes[0], 0x52); // 'R'
    assert.equal(wavBytes[1], 0x49); // 'I'
    assert.equal(wavBytes[2], 0x46); // 'F'
    assert.equal(wavBytes[3], 0x46); // 'F'
    assert.throws(() => wrapAacInWav(new Uint8Array([0x00, 0x11, 0x22]))); // non-aac

    // wrapRawAudioInWav
    const rawData = new Uint8Array([0x11, 0x22, 0x33]);
    const formats = ['amr-nb', 'amr-wb', 'gsm', 'alaw', 'mulaw'];
    for (const fmt of formats) {
      const rawWav = wrapRawAudioInWav(rawData, fmt);
      assert.equal(rawWav[0], 0x52); // 'R'
      assert.equal(rawWav[8], 0x57); // 'W'
    }
    assert.throws(() => wrapRawAudioInWav(rawData, 'invalid-format'));

    // wrapCafInWav validation
    assert.throws(() => wrapCafInWav(new Uint8Array([0x00, 0x11]))); // too short
    assert.throws(() => wrapCafInWav(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))); // not caff
  });

  test('Video format validation', () => {
    // MIME checks
    assert.equal(isUnsupportedVideoFile('video/mp4', 'video.mp4'), false);
    assert.equal(isUnsupportedVideoFile('video/webm', 'video.webm'), false);
    assert.equal(isUnsupportedVideoFile('video/quicktime', 'video.mov'), true);
    assert.equal(isUnsupportedVideoFile('video/x-matroska', 'video.mkv'), true);

    // Extension checks (no MIME)
    assert.equal(isUnsupportedVideoFile(null, 'video.mov'), true);
    assert.equal(isUnsupportedVideoFile(null, 'video.mkv'), true);
    assert.equal(isUnsupportedVideoFile(null, 'video.mp4'), false);
    assert.equal(isUnsupportedVideoFile(null, 'video.webm'), false);
  });

  test('Bot-specific Whisper models schema', () => {
    const config = { whisperModels: 'model-a,model-b' };
    const models = getAvailableModels(config);
    assert.deepEqual(models, ['model-a', 'model-b']);
  });

  test('formatUserMarkdown formatting', () => {
    const u1 = { first_name: 'John', last_name: 'Doe', username: 'johndoe', id: 123 };
    assert.equal(formatUserMarkdown(u1), '[John Doe](tg://user?id=123) \\(@johndoe\\)');
  });
});
