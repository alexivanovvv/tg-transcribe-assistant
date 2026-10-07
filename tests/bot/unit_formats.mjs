import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSCRIPT_FORMATS,
  DEFAULT_TRANSCRIPT_FORMAT,
  normalizeTranscriptFormat,
  buildTranscriptionMessages
} from '../../lib/utils.js';
import { parseWebhookConfig, buildWebhookSetup } from '../../lib/webhook-settings.js';
import { getMenuTextAndKeyboard } from '../../lib/framework/menu.js';
import '../../lib/menus.js';

const header = '🎤 *Транскрипция:*';

describe('Transcript formats', () => {
  test('unknown format falls back to the default sparkle style', () => {
    assert.equal(DEFAULT_TRANSCRIPT_FORMAT, 'sparkle');
    assert.equal(normalizeTranscriptFormat('nope'), 'sparkle');
    assert.equal(normalizeTranscriptFormat(undefined), 'sparkle');
  });

  test('each format renders its own shape', () => {
    const render = (format) => buildTranscriptionMessages('Привет. Как дела?', { header, format })[0];
    assert.equal(render('sparkle'), '❇️\n\n_Привет\\. Как дела?_');
    assert.equal(render('classic'), `${header}\n\nПривет\\. Как дела?`);
    assert.equal(render('abc'), '🔤 Привет\\. Как дела?');
    assert.equal(render('quote'), '🎤\n>Привет\\. Как дела?');
    assert.equal(render('expand'), '🎤\n**>Привет\\. Как дела?||');
    assert.equal(render('plain'), 'Привет\\. Как дела?');
  });

  test('quote styles prefix every paragraph line', () => {
    const msg = buildTranscriptionMessages('Один.\n\nДва.', { header, format: 'quote' })[0];
    assert.equal(msg, '🎤\n>Один\\.\n>\n>Два\\.');
  });

  test('prefix goes above the formatted body', () => {
    const msg = buildTranscriptionMessages('Текст.', { header, format: 'abc', prefix: '🤔 *X*' })[0];
    assert.equal(msg, '🤔 *X*\n\n🔤 Текст\\.');
  });

  test('fmt survives the webhook URL round-trip and default is omitted', () => {
    const base = parseWebhookConfig({ url: 'https://x.test/api/webhook?owner=1' });
    assert.equal(base.fmt, 'sparkle');
    assert.ok(!buildWebhookSetup('https://x.test', 't', base, 's').url.includes('fmt='));

    const setup = buildWebhookSetup('https://x.test', 't', { ...base, fmt: 'quote' }, 's');
    assert.match(setup.url, /fmt=quote/);
    assert.equal(parseWebhookConfig({ url: setup.url }).fmt, 'quote');
  });

  test('format menu previews every variant and marks the active one', async () => {
    const res = await getMenuTextAndKeyboard('format', { fmt: 'abc' }, 'ru', {});
    for (let i = 1; i <= TRANSCRIPT_FORMATS.length; i++) assert.match(res.text, new RegExp(`Вариант ${i}`));
    assert.match(res.text, /Вариант 3\* ✅/);
    const buttons = res.replyMarkup.inline_keyboard.flat().map(b => b.text);
    assert.ok(buttons.some(t => t.startsWith('★') && t.includes('🔤')));
  });
});
