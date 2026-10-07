import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { sliceOggOpus } from '../../lib/ogg.js';
import { isHallucinatedText } from '../../lib/utils.js';
import { transcribeAudio } from '../../lib/transcriber.js';

// Minimal Ogg Opus stream: OpusHead, OpusTags, then one audio page per second
function oggPage(flags, granule, sequence, body) {
  const page = new Uint8Array(27 + 1 + body.length);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  page[5] = flags;
  view.setBigInt64(6, BigInt(granule), true);
  view.setUint32(18, sequence, true);
  page[26] = 1;
  page[27] = body.length;
  page.set(body, 28);
  return page;
}

function buildOgg(seconds) {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode('OpusHead'), 0);
  head[8] = 1; head[9] = 1; head[10] = 0x38; head[11] = 0x01; // version, channels, pre-skip 312
  const pages = [oggPage(0x02, 0, 0, head), oggPage(0, 0, 1, new TextEncoder().encode('OpusTags'))];
  for (let s = 1; s <= seconds; s++) pages.push(oggPage(s === seconds ? 0x04 : 0, 312 + s * 48000, s + 1, new Uint8Array([s])));
  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of pages) { out.set(p, pos); pos += p.length; }
  return out;
}

function readPages(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const pages = [];
  for (let pos = 0; pos < buf.length;) {
    const len = 27 + buf[pos + 26] + buf[pos + 27];
    pages.push({ flags: buf[pos + 5], granule: Number(view.getBigInt64(pos + 6, true)), seq: view.getUint32(pos + 18, true), body: buf[pos + 28] });
    pos += len;
  }
  return pages;
}

describe('Ogg slicing', () => {
  test('keeps headers and only the requested range, with rebased granules and EOS', () => {
    const pages = readPages(sliceOggOpus(buildOgg(10), 3, 6));
    assert.deepEqual(pages.slice(2).map(p => p.body), [4, 5, 6]);
    assert.deepEqual(pages.map(p => p.seq), [0, 1, 2, 3, 4]);
    assert.equal(pages[2].granule, 312 + 48000);
    assert.equal(pages[pages.length - 1].flags & 0x04, 0x04);
  });

  test('returns null for non-Ogg input', () => {
    assert.equal(sliceOggOpus(new Uint8Array(100), 0, 1), null);
  });
});

describe('Hallucination detection', () => {
  test('flags subtitle credits but not normal speech', () => {
    assert.equal(isHallucinatedText('Субтитры делал DimaTorzok'), true);
    assert.equal(isHallucinatedText('Спасибо за просмотр!'), true);
    assert.equal(isHallucinatedText('По поводу коворкинг-сессии у меня пока нет мнения.'), false);
  });
});

describe('Lost segment repair', () => {
  const realFetch = globalThis.fetch;
  after(() => { globalThis.fetch = realFetch; });

  async function run(segments, repairText) {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      url = String(url);
      if (url.includes('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/a.oga', file_size: 1 } }));
      if (url.includes('/file/bot')) return new Response(buildOgg(40));
      calls.push(opts.body);
      if (calls.length === 1) return new Response(JSON.stringify({ text: segments.map(s => s.text).join(''), segments }));
      return new Response(JSON.stringify({ text: repairText }));
    };
    const result = await transcribeAudio('id', { telegramBotToken: 't', whisperApiKey: 'k', whisperPrompt: 'Claude Code' }, {});
    return { result, calls };
  }

  const seg = (start, end, text) => ({ start, end, text, avg_logprob: -0.2, no_speech_prob: 0.02 });

  test('re-transcribes a collapsed window without the prompt', async () => {
    const { result, calls } = await run([
      seg(0, 10, ' Первая часть сообщения, где все распознано нормально и подробно.'),
      seg(10, 38, ' Claude Codem'),
      seg(38, 40, ' Спасибо.')
    ], 'Потерянный кусок речи, который вернулся.');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].get('prompt'), null);
    assert.match(result.text, /Потерянный кусок речи/);
    assert.doesNotMatch(result.text, /Claude Codem/);
    assert.equal(result.quality, 'good');
  });

  test('drops a subtitle credit instead of failing the whole transcription', async () => {
    const { result } = await run([
      seg(0, 10, ' Нормальная речь, которую надо сохранить целиком и без потерь.'),
      seg(10, 38, ' Субтитры делал DimaTorzok')
    ], 'Субтитры сделал DimaTorzok');
    assert.doesNotMatch(result.text, /DimaTorzok/);
    assert.equal(result.quality, 'good');
  });

  test('leaves good transcriptions untouched', async () => {
    const { calls } = await run([seg(0, 5, ' Обычный короткий войс без всяких проблем.')], '');
    assert.equal(calls.length, 1);
  });
});

describe('ElevenLabs Scribe', () => {
  const realFetch = globalThis.fetch;
  after(() => { globalThis.fetch = realFetch; });

  const word = (text, start, logprob = -0.05) => ({ text, start, end: start + 0.3, type: 'word', logprob });

  async function run(scribeResponse) {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      url = String(url);
      if (url.includes('/getFile')) return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/a.oga', file_size: 1 } }));
      if (url.includes('/file/bot')) return new Response(buildOgg(5));
      calls.push(url);
      if (url.includes('elevenlabs')) return scribeResponse();
      return new Response(JSON.stringify({ text: 'Ответ от Whisper.', segments: [{ start: 0, end: 3, text: 'Ответ от Whisper.', avg_logprob: -0.2, no_speech_prob: 0.01 }] }));
    };
    const result = await transcribeAudio('id', { telegramBotToken: 't', whisperApiKey: 'k', elevenlabsApiKey: 'el' }, {});
    return { result, calls };
  }

  test('is used first and its word confidence drives the quality rating', async () => {
    const { result, calls } = await run(() => new Response(JSON.stringify({
      text: 'Буду в кабинете до семи . Let me know.',
      words: [word('Буду', 0), word('в', 0.4), word('кабинете', 0.6), word('до', 1), word('семи.', 1.2), word('Let', 2), word('me', 2.2), word('know.', 2.4)]
    })));
    assert.equal(calls.length, 1);
    assert.equal(result.model, 'scribe_v2');
    assert.equal(result.text, 'Буду в кабинете до семи. Let me know.');
    assert.equal(result.quality, 'good');
  });

  test('low word confidence makes the result doubtful', async () => {
    const { result } = await run(() => new Response(JSON.stringify({
      text: 'Что-то невнятное.', words: [word('Что-то', 0, -1.2), word('невнятное.', 0.5, -0.9)]
    })));
    assert.equal(result.quality, 'doubtful');
  });

  test('falls back to Whisper when Scribe fails', async () => {
    const { result, calls } = await run(() => new Response('quota exceeded', { status: 401 }));
    assert.equal(calls.length, 2);
    assert.equal(result.text, 'Ответ от Whisper.');
  });

  test('silence is not retried with Whisper', async () => {
    const { result, calls } = await run(() => new Response(JSON.stringify({ text: '', words: [] })));
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
  });
});
