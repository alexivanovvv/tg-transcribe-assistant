// lib/insights.js
// LLM extras on top of a transcription: short summary and reply suggestions.
// Both go privately to the account owner, never into the conversation itself.

import { DEFAULT_API_BASE } from './transcriber.js';
import { formatParagraphs } from './utils.js';

// Fast model keeps transcription + extras inside the serverless time budget
export const DEFAULT_INSIGHTS_MODEL = 'qwen/qwen3.8-27b';
const INSIGHTS_TIMEOUT = 6000;
// Very short voices have nothing to condense
export const MIN_SUMMARY_CHARS = 300;

// Second model has its own rate-limit bucket on Groq (8k tokens/min per model on the free tier)
const FALLBACK_MODEL = 'openai/gpt-oss-120b';

const POLISH_PROMPT = `You clean up a raw speech-to-text transcript of a Telegram voice message. Output ONLY the cleaned transcript text, nothing else.
Do: fix punctuation and capitalization, split run-on speech into proper sentences, turn questions into questions, use a colon or a dash where the speaker introduces a topic, remove pure filler words and verbal tics (e.g. "вот", "ну", "типа", "как бы", "эм", "uh", "um") when they carry no meaning, merge stutters and immediate word repetitions, split the text into paragraphs by meaning (a blank line between paragraphs): start a new paragraph at each topic change or new point, e.g. "Первое", "Второй вопрос", "И третье", "Also", typically every 2-4 sentences; a short message of 1-3 sentences stays one paragraph; fix obviously misrecognized words using context (e.g. English terms transcribed phonetically: "ассэспент" -> "assessment").
Do NOT: rephrase, summarize, shorten meaningfully, reorder, translate, add words or facts, change the speaker's vocabulary, slang or grammatical person, or answer questions in the text. Keep the original language. Keep numbers as written. Use "е" instead of "ё".`;

const REPLIES_RULES = `3 different replies the owner could send back, written as the owner types in a casual chat: 2-3 short sentences, about 150-300 characters each, informal "you" if the sender uses it, no greeting or sign-off, no emoji. React to the sender's key points and answer their questions or requests (e.g. "Скинешь доступ - я тоже погоняю?", "согласен", a concrete suggestion). The variants must differ in stance or idea (e.g. enthusiastic with a suggestion; agreeing but proposing something else; short and businesslike). Never invent the owner's plans, promises or facts not implied by the message; where the owner has to choose, let different variants choose differently. Use a plain hyphen "-" instead of an em dash and "е" instead of "ё".`;

const INSIGHTS_PROMPT = `You get a transcription of a voice message that someone sent to the account owner in Telegram. Return strictly JSON: {"summary": "...", "replies": ["...", "...", "..."]}. Write everything in the language of the message.

summary: a short summary in the first person of the message author (as if the author briefly stated the gist). Structure: 1-3 topic blocks; each block is a heading line with a fitting emoji and a **bold** title, then 1-3 bullet points "- **Topic:** gist". If there was a closing wish or goodbye, put it on a separate last line. Gist only: no intro, no filler, never invent facts or opinions. Markdown: **bold**, bullets with "- ", newlines as \\n.

replies: ${REPLIES_RULES}`;

async function requestChat(config, model, system, user, json) {
  const apiBase = (config.whisperApiBase || DEFAULT_API_BASE).replace(/\/audio\/transcriptions$/, '').replace(/\/$/, '');
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: json ? 0.5 : 0.1
  };
  if (json) body.response_format = { type: 'json_object' };
  if (/gpt-oss/.test(model)) body.reasoning_effort = 'low';
  const res = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.whisperApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(INSIGHTS_TIMEOUT)
  });
  if (!res.ok) throw new Error(`Chat API ${res.status} (${model}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  // Reasoning models may prepend a <think> block
  return (data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function callChat(config, system, user, { json = false } = {}) {
  const primary = config.insightsModel || DEFAULT_INSIGHTS_MODEL;
  try {
    return await requestChat(config, primary, system, user, json);
  } catch (e) {
    // A timeout means the budget is spent; only rate limits / server errors are worth a second model
    if (primary === FALLBACK_MODEL || e.name === 'TimeoutError') throw e;
    console.warn(`[Insights] ${e.message}; retrying with ${FALLBACK_MODEL}`);
    return await requestChat(config, FALLBACK_MODEL, system, user, json);
  }
}

// Keep the model's topic-based paragraphs; fall back to length-based ones if it returned a single block
function splitParagraphs(text) {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return paragraphs.length > 1 ? paragraphs.join('\n\n') : formatParagraphs(text);
}

/**
 * Light cleanup of a raw transcript: punctuation, sentences, fillers, paragraphs. Returns the original text
 * when the model fails or the result drifts too far in length (a sign it rewrote or truncated).
 */
export async function polishTranscript(text, config) {
  try {
    const cleaned = await callChat(config, POLISH_PROMPT, text);
    const ratio = cleaned.length / Math.max(text.length, 1);
    if (!cleaned || ratio < 0.6 || ratio > 1.3) {
      console.warn(`[Polish] Rejected cleanup (length ratio ${ratio.toFixed(2)})`);
      return formatParagraphs(text);
    }
    return splitParagraphs(cleaned);
  } catch (e) {
    console.error('[Polish] failed, using raw transcript:', e.message);
    return formatParagraphs(text);
  }
}

const REPLIES_PROMPT = `You get a transcription of a voice message that someone sent to the account owner in Telegram. Return strictly JSON: {"replies": ["...", "...", "..."]} in the language of the message.

replies: ${REPLIES_RULES}`;

function parseReplies(data) {
  return Array.isArray(data.replies) ? data.replies.map(r => String(r).trim()).filter(Boolean).slice(0, 3) : [];
}

function parseJson(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw);
}

/**
 * Fresh reply options for the "more options" button; previous ones are passed so the model avoids repeating them.
 */
export async function generateReplies(text, config, previous = []) {
  const avoid = previous.length ? `\n\nAlready suggested (write different ones):\n${previous.map(r => `- ${r}`).join('\n')}` : '';
  return parseReplies(parseJson(await callChat(config, REPLIES_PROMPT, `${text}${avoid}`, { json: true })));
}

/**
 * Summary and reply options in one call (one rate-limit hit, one input pass).
 */
export async function generateInsights(text, config) {
  const data = parseJson(await callChat(config, INSIGHTS_PROMPT, text, { json: true }));
  return { summary: typeof data.summary === 'string' ? data.summary.trim() : '', replies: parseReplies(data) };
}
