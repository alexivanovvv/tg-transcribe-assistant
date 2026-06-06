// lib/utils.js
// Bot-specific formatting, text processing and re-usable utilities

import {
  escapeMarkdownV2,
  getMarkdownV2RenderedLength,
  findSplitIndex
} from './framework/markdown.js';

export const MAX_PROMPT_TOKENS = 224;

/**
 * Roughly estimate the number of Whisper/GPT-2 tokens in a string (no dependencies).
 * ASCII characters count as ~0.25 tokens (4 chars/token);
 * non-ASCII (Cyrillic, CJK, etc.) count as ~0.5 tokens (2 chars/token).
 */
export function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += char.codePointAt(0) > 127 ? 0.5 : 0.25;
  }
  return Math.ceil(tokens);
}

/**
 * Truncate estimated Whisper tokens from the left (keeping the end of the prompt).
 * Whisper only uses the last 224 tokens of the prompt.
 * Reference: https://developers.openai.com/api/docs/guides/speech-to-text
 */
export function truncateTokensFromLeft(text, maxTokens) {
  if (!text) return '';
  let tokens = 0;
  let cutIdx = text.length;
  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i];
    const charTokens = char.codePointAt(0) > 127 ? 0.5 : 0.25;
    if (tokens + charTokens > maxTokens) {
      break;
    }
    tokens += charTokens;
    cutIdx = i;
  }
  return text.substring(cutIdx);
}

function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  const rem = String(s % 60).padStart(2, '0');
  return `${m}:${rem}`;
}

function getVerboseFooterMarkdown(options) {
  const { fileType, fileSize, fileDuration, durationSec, actualFormat, signatureFormat, whisperDuration, instanceStart, instanceUptime, model, language } = options;
  const esc = escapeMarkdownV2;
  const format = actualFormat || fileType;
  let formatStr = format;
  if (signatureFormat && signatureFormat !== format) {
    formatStr += ` (${signatureFormat})`;
  }
  
  const infoParts = [
    `_${esc(formatStr)}_`,
    model ? `_${esc(model)}_` : null,
    (language && language !== 'auto') ? `lang: _${esc(language)}_` : null,
    `_${esc(formatDuration(fileDuration))}_`,
    `_${esc((fileSize / 1024).toFixed(1) + 'KB')}_`
  ].filter(Boolean);
  
  const infoLine = `⚙️ Info: ${infoParts.join(', ')}`;
  
  let timeStr;
  if (whisperDuration) {
    const totalSec = parseFloat(durationSec) || 0;
    const apiSec = parseFloat(whisperDuration) || 0;
    const overheadSec = Math.max(0, totalSec - apiSec);
    timeStr = `_${esc(apiSec.toFixed(1) + 's')}_ API _${esc('+' + overheadSec.toFixed(1) + 's')}_`;
  } else {
    timeStr = `_${esc(durationSec + 's')}_ total`;
  }
  const timeLine = `⏱ Time: ${timeStr}`;
  
  let footer = `${infoLine}\n${timeLine}`;
  if (instanceStart) {
    let uptimeStr = 'new';
    if (typeof instanceUptime === 'number') {
      const uptimeSec = instanceUptime / 1000;
      const uptimeRounded = uptimeSec.toFixed(1);
      uptimeStr = (uptimeRounded === '0.0' || uptimeSec < 0.05) ? 'new' : `${uptimeRounded}s`;
    }
    const suffix = uptimeStr === 'new'
      ? `${esc('(')}_${esc(uptimeStr)}_${esc(')')}`
      : `${esc('(Up: ')}_${esc(uptimeStr)}_${esc(')')}`;

    footer += `\n🚀 Inst: _${esc(instanceStart)}_ ${suffix}`;
  }
  return footer;
}

export function splitTranscriptionText(text, options = {}) {
  const { header, isGuest, verbose, guestWarningText } = options;
  
  const verboseFooterPlain = verbose ? getVerboseFooterMarkdown(options) : "";
  const guestWarningPlain = guestWarningText || '';

  const singleHeaderRenderedLen = getMarkdownV2RenderedLength(header);
  const singleFooterRenderedLen = verbose ? getMarkdownV2RenderedLength(verboseFooterPlain) : 0;
  const singleTotalOverhead = singleHeaderRenderedLen + 2 + singleFooterRenderedLen;

  if (text.length + singleTotalOverhead <= 4096) {
    return [text];
  }

  const paginationOverhead = 10;
  const chunks = [];
  let remaining = text.trim();
  
  while (remaining.length > 0) {
    const isFirstChunk = chunks.length === 0;
    let footerLen = 0;
    if (isGuest && isFirstChunk) {
      footerLen = getMarkdownV2RenderedLength(guestWarningPlain);
    }
    
    const headerLen = getMarkdownV2RenderedLength(header) + paginationOverhead;
    const maxChunkLen = 4096 - headerLen - 2 - footerLen;
    
    const lastFooterLen = verbose ? getMarkdownV2RenderedLength(verboseFooterPlain) : 0;
    const lastMaxChunkLen = 4096 - headerLen - 2 - lastFooterLen;
    
    if (remaining.length <= lastMaxChunkLen) {
      chunks.push(remaining);
      break;
    }
    
    let splitIdx = findSplitIndex(remaining, maxChunkLen);
    if (splitIdx <= 0) splitIdx = 1;
    
    chunks.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }
  
  return chunks;
}

export function buildTranscriptionMessages(text, options = {}) {
  const chunks = splitTranscriptionText(text, options);
  const { header, isGuest, verbose, guestWarningText } = options;
  const guestWarningPlain = guestWarningText || '';
  
  return chunks.map((chunk, i) => {
    let chunkHeader = header;
    if (chunks.length > 1) {
      chunkHeader = `${header} _\\[${i + 1}/${chunks.length}\\]_`;
    }
    
    let chunkResponseText = `${chunkHeader}\n\n${escapeMarkdownV2(chunk)}`;
    
    if (isGuest && chunks.length > 1 && i === 0) {
      chunkResponseText += `\n\n⚠️ _${escapeMarkdownV2(guestWarningPlain.replace(/^⚠️\s?/, ''))}_`;
    }
    
    if (verbose && i === chunks.length - 1) {
      chunkResponseText += `\n\n${getVerboseFooterMarkdown(options)}`;
    }
    
    return chunkResponseText;
  });
}

/**
 * Formats a Telegram User object into a clickable MarkdownV2 link.
 * If username exists (and is not 'none'), appends it in parentheses.
 * e.g., [John Doe](tg://user?id=12345) (@johndoe)
 */
export function formatUserMarkdown(user) {
  if (!user) return 'User';
  const first = user.first_name || '';
  const last = user.last_name || '';
  const displayName = [first, last].filter(Boolean).join(' ') || 'User';
  const esc = escapeMarkdownV2;
  const escapedName = esc(displayName);
  const userLink = `[${escapedName}](tg://user?id=${user.id})`;
  
  if (user.username && user.username !== 'none') {
    return `${userLink} \\(@${esc(user.username)}\\)`;
  }
  return userLink;
}

/**
 * Checks if a Telegram API error is a user-space delivery error (e.g. blocked, chat not found)
 * rather than a systemic bot/network failure.
 * @param {string|Error} error - The error message or Error object.
 * @returns {boolean} True if it is a user-space delivery error.
 */
export function isUserSpaceError(error) {
  if (!error) return false;
  const msg = (typeof error === 'string' ? error : error.message || String(error)).toLowerCase();
  return msg.includes("chat not found") ||
         msg.includes("blocked by the user") ||
         msg.includes("user is deactivated") ||
         msg.includes("reply message not found") ||
         msg.includes("is not a member of the") ||
         msg.includes("business_connection_not_allowed");
}

