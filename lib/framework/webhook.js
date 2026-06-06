// lib/framework/webhook.js
// Generic Webhook Engine for Telegram Bots

import { getHeader, sha256, setDebugOwnerId, callTelegram } from './utils.js';

const processedUpdates = new Set();
const UPDATE_HANDLERS = {};
let globalErrorHandler = null;
let botId = null;
let botUsername = null;
let botSupportsGuest = false;
let parseSettingsFromQuery = (query = {}) => ({ owner: query.owner || '' });

export function registerUpdateHandler(type, handler) {
  UPDATE_HANDLERS[type] = handler;
}

export function registerErrorHandler(handler) {
  globalErrorHandler = handler;
}

export function configureWebhookFramework(options = {}) {
  if (typeof options.parseSettingsFromQuery === 'function') {
    parseSettingsFromQuery = options.parseSettingsFromQuery;
  }
}

export function clearDeduplicationCache() {
  processedUpdates.clear();
}

export async function verifyWebhookSecret(headers, token) {
  const expectedSecret = await sha256(token);
  const receivedSecret = getHeader(headers, 'x-telegram-bot-api-secret-token');
  return expectedSecret && receivedSecret === expectedSecret;
}

export function hasBotMention(message, botUsername) {
  if (!message || !botUsername) return false;
  const text = message.text || message.caption || '';
  const entities = message.entities || message.caption_entities || [];
  
  for (const entity of entities) {
    if (entity.type === 'mention') {
      const mentionText = text.substring(entity.offset, entity.offset + entity.length);
      if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) {
        return true;
      }
    }
  }
  return false;
}

export function clearBotInfoCache() {
  botUsername = null;
  botId = null;
  botSupportsGuest = false;
}

export async function getBotInfo(token) {
  if (botUsername && botId) {
    return { username: botUsername, id: botId, supports_guest_queries: botSupportsGuest };
  }
  try {
    const data = await callTelegram(token, 'getMe', {});
    if (data.ok) {
      botUsername = data.result.username;
      botId = data.result.id;
      botSupportsGuest = !!data.result.supports_guest_queries;
      return { username: botUsername, id: botId, supports_guest_queries: botSupportsGuest };
    }
  } catch (e) {
    console.error('getMe failed in getBotInfo:', e);
  }
  return null;
}

export async function isMessageDirectedToBot(message, token, isBusiness = false) {
  if (!message) return false;

  if (!isBusiness && message.chat && message.chat.type === 'private') {
    return true;
  }

  const text = message.text || '';
  if (text.startsWith('/')) {
    const firstWord = text.split(/\s+/)[0];
    if (firstWord.includes('@')) {
      const botInfo = await getBotInfo(token);
      const botUser = botInfo?.username;
      if (botUser && firstWord.endsWith(`@${botUser}`)) {
        return true;
      }
      return false;
    }
    return true;
  }

  const botInfo = await getBotInfo(token);
  if (botInfo) {
    if (hasBotMention(message, botInfo.username)) {
      return true;
    }
    if (message.reply_to_message && message.reply_to_message.from && message.reply_to_message.from.id === botInfo.id) {
      return true;
    }
  }

  if (isBusiness) {
    return false;
  }
  return false;
}

export async function handleWebhook(requestInfo, config, executionCtx) {
  const token = config.telegramBotToken;
  if (!token) {
    console.error('telegramBotToken is missing in config');
    return { status: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Bot token not configured' };
  }

  const headers = requestInfo.headers || {};
  const update = requestInfo.body;

  let settings = null;
  let ownerId = null;

  try {
    // 1. Verify Webhook Secret
    const isSecretValid = await verifyWebhookSecret(headers, token);
    if (!isSecretValid) {
      console.error('Unauthorized request: webhook secret mismatch');
      return { status: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Forbidden' };
    }

    if (!update || !update.update_id) {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }

    // 2. Deduplicate updates from Telegram
    if (processedUpdates.has(update.update_id)) {
      console.log(`[Deduplicator] Ignoring duplicate update_id: ${update.update_id}`);
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }
    processedUpdates.add(update.update_id);
    if (processedUpdates.size > 1000) {
      const oldest = processedUpdates.values().next().value;
      processedUpdates.delete(oldest);
    }

    console.log('--- UPDATE RECEIVED ---', JSON.stringify(update));

    const proto = getHeader(headers, 'x-forwarded-proto') || 'https';
    const host = getHeader(headers, 'host');
    const baseUrl = config.webhookBaseUrl || `${proto}://${host}`;

    // 3. Parse current settings from the request query string (very fast, offline)
    settings = parseSettingsFromQuery(requestInfo.query || {});
    ownerId = settings.owner;
    if (ownerId) {
      config.ownerChatId = ownerId;
      setDebugOwnerId(ownerId);
    }

    const ctx = {
      token,
      config,
      baseUrl,
      settings,
      ownerId,
      update,
      executionCtx
    };

    // Route dynamically based on the update keys
    for (const key of Object.keys(update)) {
      const handler = UPDATE_HANDLERS[key];
      if (handler) {
        return await handler(update[key], ctx);
      }
    }

    // Unhandled update type
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };

  } catch (error) {
    console.error('ERROR in webhook handler:', error);
    try {
      if (globalErrorHandler) {
        await globalErrorHandler(error, { token, ownerId, settings });
      }
    } catch { /* ignore */ }
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
}
