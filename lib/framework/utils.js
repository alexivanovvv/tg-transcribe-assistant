// lib/framework/utils.js
// Generic Telegram Bot API and HTTP utilities

const TELEGRAM_API_TIMEOUT = 10000;
export let _debugOwnerId = null;

export function setDebugOwnerId(id) {
  _debugOwnerId = id;
}

export function isOwner(userId, ownerId) {
  if (_debugOwnerId !== null) {
    return String(userId) === String(_debugOwnerId);
  }
  return String(userId) === String(ownerId);
}

/**
 * Helper to compute SHA-256 hash.
 */
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper to fetch a header case-insensitively.
 */
export function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return null;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

/**
 * Fetch helper to call Telegram Bot API with 429 auto-retry.
 */
export async function callTelegram(token, method, payload, retries = 2) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  let finalPayload = payload;
  if (method === 'sendMessage' || method === 'editMessageText') {
    finalPayload = {
      disable_web_page_preview: true,
      ...payload
    };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload),
      signal: AbortSignal.timeout(TELEGRAM_API_TIMEOUT)
    });
    const data = await res.json();
    
    if (!data.ok && data.error_code === 429 && retries > 0) {
      const retryAfter = (data.parameters?.retry_after || 1) * 1000;
      if (retryAfter <= 5000) {
        console.warn(`[429 Too Many Requests] Retrying ${method} after ${retryAfter}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        return await callTelegram(token, method, payload, retries - 1);
      } else {
        console.warn(`[429 Too Many Requests] retry_after ${retryAfter}ms is too long. Skipping retry for ${method}.`);
        if (_debugOwnerId) {
          const { escapeMarkdownV2, escapeMarkdownV2Code } = await import('./markdown.js');
          const escapedTitle = escapeMarkdownV2('Rate Limit (429) Skipped');
          const escapedMethod = escapeMarkdownV2Code(method);
          const timeoutSec = Math.round(retryAfter / 1000);
          
          callTelegram(token, 'sendMessage', {
            chat_id: _debugOwnerId,
            text: `⚠️ *${escapedTitle}*\nMethod: \`${escapedMethod}\`\nTimeout: ${timeoutSec}s`,
            parse_mode: 'MarkdownV2'
          }, 0).catch(() => {});
        }
      }
    }
    if (!data.ok) {
      console.error(`[Telegram API Error] ${method} returned ok=false:`, data.description || JSON.stringify(data));
      
      // Fallback: If parse_mode is MarkdownV2 and it's a parsing error, retry without parse_mode
      const hasMarkdownV2 = payload && (payload.parse_mode === 'MarkdownV2' || payload.result?.input_message_content?.parse_mode === 'MarkdownV2');
      const isParseError = data.description && data.description.toLowerCase().includes("parse entities");
      if (hasMarkdownV2 && isParseError) {
        console.warn(`[Telegram API Warning] MarkdownV2 parsing failed for ${method}. Retrying without parse_mode...`);
        const fallbackPayload = { ...payload };
        if (fallbackPayload.parse_mode === 'MarkdownV2') {
          delete fallbackPayload.parse_mode;
        } else if (fallbackPayload.result?.input_message_content?.parse_mode === 'MarkdownV2') {
          fallbackPayload.result = {
            ...fallbackPayload.result,
            input_message_content: {
              ...fallbackPayload.result.input_message_content
            }
          };
          delete fallbackPayload.result.input_message_content.parse_mode;
        }
        return await callTelegram(token, method, fallbackPayload, retries);
      }
    }
    return data;
  } catch (err) {
    if (retries > 0) {
      console.warn(`[Telegram API Error] Retrying ${method} due to network error: ${err.message}`);
      return await callTelegram(token, method, payload, retries - 1);
    }
    console.error(`[Telegram API Error] ${method} failed:`, err);
    return { ok: false, error: err.message };
  }
}

/**
 * Synchronize localized bot profile metadata (Name, Description, Short Description) with Telegram.
 */
export async function syncBotMetadata(token, langCode, name, description, shortDescription) {
  if (name !== undefined) {
    const payloadName = { name };
    if (langCode) payloadName.language_code = langCode;
    await callTelegram(token, 'setMyName', payloadName);
  }
  
  if (description !== undefined) {
    const payloadDesc = { description };
    if (langCode) payloadDesc.language_code = langCode;
    await callTelegram(token, 'setMyDescription', payloadDesc);
  }
  
  if (shortDescription !== undefined) {
    const payloadShort = { short_description: shortDescription };
    if (langCode) payloadShort.language_code = langCode;
    await callTelegram(token, 'setMyShortDescription', payloadShort);
  }
}

/**
 * Read the first N bytes from a remote resource using HTTP Range request.
 */
export async function readFirstBytes(fileUrl, numBytes = 64, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(fileUrl, {
      headers: { 'Range': `bytes=0-${numBytes - 1}` },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP status ${res.status}`);
    }

    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      while (received < numBytes) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
        }
      }
      try { await reader.cancel(); } catch { /* ignore */ }
      controller.abort();

      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return merged.subarray(0, numBytes);
    }

    const buf = await res.arrayBuffer();
    return new Uint8Array(buf).subarray(0, numBytes);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send a MarkdownV2 message with common Telegram options.
 */
export async function sendMarkdownMessage(token, chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: options.disableWebPagePreview !== false
  };
  if (options.replyToMessageId !== undefined && options.replyToMessageId !== null) {
    payload.reply_to_message_id = options.replyToMessageId;
  }
  if (options.businessConnectionId) {
    payload.business_connection_id = options.businessConnectionId;
  }
  return await callTelegram(token, 'sendMessage', payload);
}

/**
 * Context-based shorthand for sending MarkdownV2 replies.
 */
export async function replyMarkdown(ctx, text, options = {}) {
  const token = options.token || ctx.token;
  const chatId = options.chatId || ctx.chatId;
  return await sendMarkdownMessage(token, chatId, text, options);
}

/**
 * Generic helper to retrieve environment variables across Node.js, Deno, and custom env objects.
 */
export function getRuntimeEnv(key, envObj = null) {
  if (envObj && typeof envObj === 'object' && envObj[key] !== undefined) {
    return envObj[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}
