// lib/reminders.js
// "Waiting for your reply": incoming business voices the owner has not answered within REMIND_HOURS
// get one private reminder. State is a single KV map keyed by chat id; the owner writing anything
// in that chat clears it. Checked by the scheduled function netlify/functions/remind.mjs.

import { kvGet, kvSet } from './kv.js';
import { callTelegram } from './framework/utils.js';
import { escapeMarkdownV2 } from './framework/markdown.js';
import { getMarkdown } from './localize.js';

const KEY = 'pending';
// No pings at night (owner's local time); due reminders wait for the morning
const TIME_ZONE = 'Europe/Amsterdam';
const DAY_START = 9;
const DAY_END = 22;
const PREVIEW_CHARS = 160;

export async function markPending(chatId, { to, who, text, lang }) {
  const pending = (await kvGet(KEY)) || {};
  const prev = pending[chatId];
  // A series of voices counts from the first unanswered one
  pending[chatId] = { to, who, lang, at: prev?.at || Date.now(), text: prev ? `${prev.text} ${text}` : text };
  await kvSet(KEY, pending);
}

export async function clearPending(chatId) {
  const pending = await kvGet(KEY);
  if (!pending?.[chatId]) return;
  delete pending[chatId];
  await kvSet(KEY, pending);
}

function localHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(now));
}

function preview(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > PREVIEW_CHARS ? `${clean.slice(0, PREVIEW_CHARS).replace(/\s+\S*$/, '')}…` : clean;
}

/**
 * Sends one reminder per chat whose voice has waited longer than `hours`, then forgets it.
 */
export async function sendDueReminders(token, hours, now = Date.now()) {
  if (!token || !(hours > 0)) return 0;
  const hour = localHour(now);
  if (hour < DAY_START || hour >= DAY_END) return 0;
  const pending = await kvGet(KEY);
  if (!pending) return 0;
  let sent = 0;
  for (const [chatId, item] of Object.entries(pending)) {
    const waitedHours = (now - item.at) / 3600000;
    if (waitedHours < hours) continue;
    const header = getMarkdown(item.lang || 'ru', 'remindWaiting', { hours: String(Math.floor(waitedHours)) });
    const text = `${header} · ${item.who}\n\n_${escapeMarkdownV2(preview(item.text))}_`;
    const res = await callTelegram(token, 'sendMessage', { chat_id: item.to, text, parse_mode: 'MarkdownV2' });
    if (res?.ok === false) console.error(`[Remind] chat ${chatId}: ${res.description}`);
    delete pending[chatId];
    sent++;
  }
  if (sent) await kvSet(KEY, pending);
  return sent;
}
