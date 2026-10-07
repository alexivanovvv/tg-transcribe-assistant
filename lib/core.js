// lib/core.js
// Core Engine for Telegram Voice Transcribot

import { isAdtsAac } from './wav-wrapper.js';
import { getTranslation, getMarkdown, getUserLang } from './localize.js';
import { callTelegram, getRuntimeEnv, sendMarkdownMessage } from './framework/utils.js';
import { escapeMarkdownV2, escapeMarkdownV2Code } from './framework/markdown.js';
import { buildTranscriptionMessages, formatUserMarkdown, isUserSpaceError } from './utils.js';
import { transcribeAudio, isUnsupportedVideoFile, DEFAULT_API_BASE } from './transcriber.js';
import { parseWebhookConfig, buildWebhookSetup, getWebhookConfig, updateWebhookConfig } from './webhook-settings.js';
import { handleCommand, setupBotProfile, setupBotAvatar } from './commands.js';
import { openMenu, configureMenuFramework, handleCallbackQuery } from './framework/menu.js';
import { getAvailableModels } from './menus.js';
import './dashboard.js';
import { registerHttpRoute, handleHealthCheck as frameworkHealthCheck } from './framework/router.js';
import { configureConfigBuilder } from './framework/adapters.js';
import { makeWebhookSetupHandler } from './framework/setup.js';
import { buildReplyRequest } from './framework/reply.js';
import { 
  configureWebhookFramework,
  registerUpdateHandler, 
  registerErrorHandler,
  handleWebhook as frameworkWebhook,
  hasBotMention,
  getBotInfo,
  isMessageDirectedToBot as frameworkIsMessageDirectedToBot
} from './framework/webhook.js';

let coreLang = 'en';
let coreApiKeyMissing = false;
// Owner chat ID to deliver secretary transcriptions privately (null = reply in the business chat)
let coreSecretaryPrivateChat = null;

configureMenuFramework({
  loadSettings: getWebhookConfig,
  saveSettings: updateWebhookConfig,
  getUserLang,
  getTranslation
});

configureWebhookFramework({
  parseSettingsFromQuery: (query = {}) => parseWebhookConfig({ url: '?' + new URLSearchParams(query).toString() })
});

configureConfigBuilder(createConfig);

// Register update handlers with the framework webhook engine
registerUpdateHandler('my_chat_member', handleMyChatMemberUpdate);
registerUpdateHandler('message', handleMessageUpdate);
registerUpdateHandler('business_message', handleMessageUpdate);
registerUpdateHandler('guest_message', handleMessageUpdate);
registerUpdateHandler('callback_query', handleCallbackQueryUpdate);
registerUpdateHandler('business_connection', handleBusinessConnectionUpdate);

registerErrorHandler(async (error, { token, ownerId, settings }) => {
  if (ownerId) {
    const notifyLang = settings?.langbot || 'en';
    const text = getMarkdown(notifyLang, 'notifyCriticalError', {
      error: error.stack || error.message || String(error)
    });
    await notifyOwner(text, token, ownerId);
  }
});

registerHttpRoute('/api/health', handleHealthCheck);
registerHttpRoute('/health', handleHealthCheck);
registerHttpRoute('/api/webhook', handleWebhook);
registerHttpRoute('/webhook', handleWebhook);
registerHttpRoute('/api/setup', handleSetup);
registerHttpRoute('/setup', handleSetup);


// File size limits in bytes
const MAX_MB = 20;
const MAX_FILE_SIZE = MAX_MB * 1024 * 1024;


// Cache for last processed business media message to prevent duplicates from multiple business connections
let lastProcessedBusinessFileUniqueId = null;

let INSTANCE_START_TIME = Date.now();
let isColdStartLogged = false;

function formatTimePart(timeMs) {
  return new Date(timeMs).toISOString().slice(11, -1);
}



// Default Webhook Settings
const DEFAULT_WEBHOOK_SETTINGS = {
  groups: true,
  guest: true,
  secretary: true,
  lang: 'auto',
  langbot: 'auto',
  model: '',
  notify_add: true,
  notify_conn: true,
  notify_err: true,
  verbose: false,
  secpriv: false,
  prompt: '',
  owner: ''
};


// hasBotMention is imported from './framework/webhook.js'

/**
 * Check if the message is directed to the bot (either via slash command, mention, or reply in group).
 */
export async function isMessageDirectedToBot(message, token, isBusiness = false) {
  return await frameworkIsMessageDirectedToBot(message, token, isBusiness);
}

/**
 * Send alert to the bot owner.
 */
async function notifyOwner(text, token, ownerId) {
  if (!ownerId) return;
  try {
    const res = await sendMarkdownMessage(token, ownerId, text);
    if (!res.ok) {
      const errorText = res.description || res.error || 'Unknown error';
      console.error('Failed to notify owner:', errorText);
    }
  } catch (e) {
    console.error('Failed to notify owner:', e);
  }
}

/**
 * Export group invite link.
 */
async function getGroupInviteLink(chatId, token) {
  try {
    const data = await callTelegram(token, 'exportChatInviteLink', { chat_id: chatId });
    if (data.ok) {
      return data.result;
    }
  } catch (e) {
    console.error('Failed to export chat invite link:', e);
  }
  return null;
}

/**
 * Send response helper.
 */
async function sendReply(token, update, chatMessage, text, replyToMessage) {
  let finalReplyText = text;
  if (coreApiKeyMissing) {
    const warning = getMarkdown(coreLang, 'apiKeyMissing', { key: 'WHISPER_API_KEY' });
    if (text !== warning) {
      finalReplyText = warning + '\n\n' + text;
    }
  }

  const { method, payload } = buildReplyRequest(update, chatMessage, finalReplyText, replyToMessage);

  // Private secretary mode: deliver to the owner's chat with the bot instead of the business chat
  if (update.business_message && coreSecretaryPrivateChat && method === 'sendMessage') {
    const chat = chatMessage.chat || {};
    const chatName = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || (chat.username ? `@${chat.username}` : String(chat.id));
    const sender = chatMessage.from;
    const senderName = sender ? ([sender.first_name, sender.last_name].filter(Boolean).join(' ') || (sender.username ? `@${sender.username}` : String(sender.id))) : chatName;
    const origin = senderName === chatName ? chatName : `${senderName} → ${chatName}`;
    payload.chat_id = coreSecretaryPrivateChat;
    payload.text = `🔒 *${escapeMarkdownV2(origin)}*\n${finalReplyText}`;
    delete payload.business_connection_id;
    delete payload.reply_to_message_id;
  }

  let attempts = 0;
  let response;
  while (attempts < 3) {
    attempts++;
    response = await callTelegram(token, method, payload);
    if (response.ok) {
      return response;
    }

    const errorText = response.description || response.error || 'Unknown error';
    console.error(`Failed to sendReply via ${method} (attempt ${attempts}):`, errorText);



    // If it's any other error, check if it's systemic or user-space
    const isUserSpace = isUserSpaceError(errorText);
    if (!isUserSpace) {
      throw new Error(`Telegram delivery failed: ${errorText}`);
    }
    
    // For normal user-space errors (blocked/deleted chat), stop retrying and return the failed response
    return response;
  }
  return response;
}

/**
 * Handle initial setup greeting for the owner.
 */
export async function sendOwnerGreeting(token, ownerId, baseUrl, userLangCode) {
  const settings = await getWebhookConfig(token);
  settings.owner = ownerId;
  settings.groups = true;
  settings.guest = true;
  settings.secretary = true;
  
  await updateWebhookConfig(token, baseUrl, settings);

  const lang = getUserLang(settings, userLangCode);
  const welcomeText = getMarkdown(lang, 'welcomeMessage', { dashboard_url: baseUrl });
  
  await sendMarkdownMessage(token, ownerId, welcomeText);

  const botInfoRes = await callTelegram(token, 'getMe', {});
  const botInfo = botInfoRes.ok ? botInfoRes.result : null;
  await openMenu('mode', token, ownerId, settings, lang, { token, botInfo });

  await setupBotProfile(token);
  await setupBotAvatar(token);
}




export async function handleCallbackQueryUpdate(callbackQuery, ctx) {
  await handleCallbackQuery(callbackQuery, ctx.config, ctx.baseUrl, (cbQuery) => {
    return {
      availableModels: getAvailableModels(ctx.config),
      userLangCode: cbQuery.from?.language_code
    };
  });
  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}

export async function handleBusinessConnectionUpdate(conn, ctx) {
  const activeSettings = await getWebhookConfig(ctx.token);
  const activeOwnerId = activeSettings.owner || ctx.ownerId;
  if (!activeOwnerId) {
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
  console.log('Business connection update:', conn);
  
  if (activeSettings.notify_conn) {
    const notifyLang = activeSettings.langbot || 'en';
    const key = conn.is_enabled ? 'notifySecConnected' : 'notifySecDisconnected';
    const replyStatusStr = conn.can_reply
      ? getTranslation(notifyLang, 'statusCanReply')
      : getTranslation(notifyLang, 'statusCannotReply');
    const text = getMarkdown(notifyLang, key, {
      raw_user: formatUserMarkdown(conn.user),
      chat_id: String(conn.user_chat_id),
      can_reply: replyStatusStr
    });
    await notifyOwner(text, ctx.token, activeOwnerId);
  }
  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}

export async function handleMyChatMemberUpdate(myChatMember, ctx) {
  const { ownerId, settings, token } = ctx;
  if (!ownerId) {
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
  const chat = myChatMember.chat;
  const newStatus = myChatMember.new_chat_member?.status;
  const oldStatus = myChatMember.old_chat_member?.status;
  
  const isAdded = (newStatus === 'member' || newStatus === 'administrator') && oldStatus !== 'member' && oldStatus !== 'administrator';
  const isGroup = chat.type === 'group' || chat.type === 'supergroup';

  if (isGroup && isAdded && settings.groups !== true) {
    console.log(`Groups disabled. Auto-leaving new group: ${chat.title} (${chat.id})`);
    await callTelegram(token, 'leaveChat', { chat_id: chat.id }).catch(() => {});
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  if (settings.groups !== true) {
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
  
  if (isAdded) {
    console.log(`Bot added to group (my_chat_member): ${chat.title} (${chat.id})`);
    
    if (settings.notify_add) {
      let linkText = '';
      const notifyLang = settings.langbot || 'en';
      const label = getTranslation(notifyLang, 'inviteLink');
      if (chat.username) {
        linkText = `\n*${escapeMarkdownV2(label)}:* https://t\\.me/${escapeMarkdownV2(chat.username)}`;
      } else {
        const inviteLink = await getGroupInviteLink(chat.id, token);
        if (inviteLink) {
          linkText = `\n*${escapeMarkdownV2(label)}:* ${escapeMarkdownV2(inviteLink)}`;
        }
      }
      const text = getMarkdown(notifyLang, 'notifyAddedGroup', {
        title: chat.title,
        chat_id: String(chat.id),
        link: ''
      }) + linkText;
      await notifyOwner(text, token, ownerId);
    }
  }
  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}
/**
 * Access whitelist (ALLOWED_USERS env: comma-separated user IDs or usernames).
 * The registered owner is always allowed; an empty list allows everyone.
 */
export function isUserAllowed(user, ownerId, config) {
  const allowed = config.allowedUsers || [];
  if (allowed.length === 0) return true;
  const id = user?.id !== undefined && user?.id !== null ? String(user.id) : '';
  if (id && ownerId && id === String(ownerId)) return true;
  const username = (user?.username || '').toLowerCase();
  return allowed.some(entry => entry === id || (username && entry === username));
}

async function getBusinessConnectionDetails(token, businessConnectionId) {
  if (!businessConnectionId) return null;
  try {
    const res = await callTelegram(token, 'getBusinessConnection', {
      business_connection_id: businessConnectionId
    });
    if (res.ok && res.result) {
      return {
        ownerId: res.result.user?.id ? String(res.result.user.id) : null,
        ownerUsername: res.result.user?.username || '',
        canReply: !!res.result.can_reply
      };
    }
  } catch (err) {
    console.error('Failed to get business connection details:', err);
  }
  return null;
}

export async function handleMessageUpdate(message, ctx) {
  if (INSTANCE_START_TIME === 0) { // Cloudflare
    INSTANCE_START_TIME = Date.now();
  }
  const requestStartTime = Date.now();
  const instanceUptimeAtStart = requestStartTime - INSTANCE_START_TIME;
  if (!isColdStartLogged) {
    console.log(`[BOOT] Cold start detected at ${formatTimePart(INSTANCE_START_TIME)}`);
    isColdStartLogged = true;
  }
  const { update, config, token, baseUrl, executionCtx } = ctx;
  let { ownerId, settings } = ctx;
  const chatId = message.chat.id;
  const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
  const businessConnectionId = update.business_message?.business_connection_id;

  // 6. Enforce OWNER_CHAT_ID security restrictions & dynamic registration
  if (!ownerId) {
    // If owner is not set, reject groups/guest/secretary
    if (isGroup || update.guest_message || businessConnectionId) {
      console.log('Ignoring group/guest/business message because no owner is registered.');
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }
    if (message.chat.type === 'private') {
      if (config.allowedOwner) {
        const allowed = String(config.allowedOwner).trim().toLowerCase().replace(/^@/, '');
        const senderId = String(message.from?.id || '');
        const senderUsername = (message.from?.username || '').toLowerCase();
        
        if (allowed !== senderId && allowed !== senderUsername) {
          console.log(`Ignoring private message from unauthorized user ${senderId} (@${senderUsername}) (allowed owner is ${config.allowedOwner}).`);
          return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
        }
      }

      ownerId = String(chatId);
      config.ownerChatId = ownerId;
      console.log(`Registering chat ${ownerId} as the dynamic owner.`);
      
      const registerOwnerTask = async () => {
        try {
          await sendOwnerGreeting(token, ownerId, baseUrl, message.from?.language_code);
        } catch (e) {
          console.error('Failed to automatically register owner:', e);
        }
      };

      if (executionCtx?.waitUntil) {
        executionCtx.waitUntil(registerOwnerTask());
      } else {
        await registerOwnerTask();
      }
    } else {
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }
  } else {
    config.ownerChatId = ownerId;
  }

  // 7. Enforce settings-based restrictions
  if (isGroup && settings.groups !== true) {
    console.log('Group messages are disabled in settings. Ignoring.');
    if (settings.groups === 'leave') {
      console.log(`Auto-leave mode active. Leaving chat ${chatId}.`);
      await callTelegram(token, 'leaveChat', { chat_id: chatId }).catch(() => {});
    }
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  if (!businessConnectionId && !isUserAllowed(message.from, ownerId, config)) {
    console.log(`Ignoring message from non-whitelisted user ${message.from?.id} (@${message.from?.username || ''}).`);
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  if (businessConnectionId || update.guest_message) {
    settings = await getWebhookConfig(token);
  }

  if (businessConnectionId && !settings.secretary) {
    console.log('Secretary mode is disabled in settings. Ignoring.');
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }
  if (update.guest_message && !settings.guest) {
    console.log('Guest mode is disabled in settings. Ignoring.');
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  // Prevent duplicate responses when quoting or mentioning the bot in a business chat
  if (update.business_message) {
    const botInfo = await getBotInfo(token);
    if (botInfo) {
      const isExplicit = hasBotMention(message, botInfo.username) || message.reply_to_message?.from?.id === botInfo.id;
      if (isExplicit && settings.guest && botInfo.supports_guest_queries) {
        console.log('Skipping business_message explicitly directed to the bot to prevent duplicate response (relying on guest_message).');
        return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
      }
    }

    // Skip outgoing business messages (sent by the business owner) in private business chats
    const isOutgoing = message.chat.type === 'private' && message.from?.id !== message.chat.id;
    if (isOutgoing) {
      const text = (message.text || '').trim();
      const isCommand = text.startsWith('/') || (botInfo?.username && text.toLowerCase().startsWith(`@${botInfo.username.toLowerCase()}`));
      const hasVoiceOrVideoNote = !!(message.voice || message.video_note);
      
      if (!isCommand && !hasVoiceOrVideoNote) {
        console.log('Skipping outgoing business message (sent by business owner) to prevent loop/actions.');
        return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
      }
    }
  }

  const langCode = message.from?.language_code;
  coreLang = getUserLang(settings, langCode);
  coreApiKeyMissing = !config.whisperApiKey;
  coreSecretaryPrivateChat = (businessConnectionId && settings.secpriv && settings.owner) ? settings.owner : null;

  const isPrivate = message.chat.type === 'private';
  const msgText = message.text || '';
  const msgCaption = message.caption || '';
  const isBusinessMsg = !!businessConnectionId;

  const botInfo = await getBotInfo(token);
  const botUsername = botInfo?.username;
  const startsWithBotMention = botUsername && (
    msgText.toLowerCase().startsWith(`@${botUsername.toLowerCase()}`) ||
    msgCaption.toLowerCase().startsWith(`@${botUsername.toLowerCase()}`)
  );
  message.botUsername = botUsername;

  let isFromClient = false;
  if (isBusinessMsg) {
    const isCommand = msgText.startsWith('/') || startsWithBotMention;
    const hasReplyAudio = !!(message.reply_to_message?.voice || message.reply_to_message?.audio || message.reply_to_message?.video_note || message.reply_to_message?.video || message.reply_to_message?.document);
    const hasDirectFile = !!(message.voice || message.audio || message.video_note || message.video || message.document);
    
    if (isCommand || hasReplyAudio || hasDirectFile) {
      const details = await getBusinessConnectionDetails(token, businessConnectionId);
      if (details) {
        if (!details.canReply) {
          console.warn(`[Business Connection] Bot lacks write permissions in ${businessConnectionId}, aborting message processing.`);
          return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
        }
        if (!isUserAllowed({ id: details.ownerId, username: details.ownerUsername }, ownerId, config)) {
          console.log(`[Business Connection] Account ${details.ownerId} is not whitelisted, ignoring.`);
          return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
        }
        isFromClient = String(message.from?.id) === details.ownerId;
      } else {
        console.warn(`[Business Connection] Failed to retrieve connection details for ${businessConnectionId}. Connection may be disabled, unauthorized, or deleted. Aborting message processing.`);
        return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
      }
    }
  }
  message.isFromClient = isFromClient;

  const isMentioned = !!(startsWithBotMention && (!isBusinessMsg || isFromClient));
  const isProcessCmd = (/^\/process(?:@\S+)?\s*$/i.test(msgText) && (!isBusinessMsg || isFromClient)) || isMentioned;

  // /prompt command source rules (3 cases):
  // Case 1: message has no file but replies to one → use only message.text (ignore caption).
  // Case 2: message itself has a file → use message.text OR caption (if not a forwarded message).
  // Case 3: forwarded message → never use caption for commands.
  const hasDirectFile = !!(message.voice || message.audio || message.video_note || message.video || message.document);
  const isForwarded = !!(message.forward_from || message.forward_origin || message.forward_from_chat);
  const cmdSource = (hasDirectFile && !isForwarded) ? (msgText || msgCaption) : msgText;

  const promptMatch = (!isBusinessMsg || isFromClient) ? cmdSource.trim().match(/^\/prompt(?:@\S+)?(?:\s+([\s\S]*))?$/i) : null;
  const isPromptCmd = !!promptMatch;
  let overridePrompt;
  if (isPromptCmd) {
    overridePrompt = promptMatch[1] ? promptMatch[1].trim() : '';
  }

  // Business connections require explicit addressing (mention or reply to bot)
  const requiresExplicit = !!businessConnectionId;
  const isExplicit = requiresExplicit ? await isMessageDirectedToBot(message, token, true) : true;

  // Reply audio is picked up in private chats always, or when /process, /prompt, or @mention is used in non-private chats.
  // Direct (non-reply) audio is always processed regardless.
  const isCommand = msgText.startsWith('/');

  const canPickReplyAudio = isBusinessMsg
    ? (isFromClient && (isProcessCmd || isPromptCmd || isMentioned))
    : ((isPrivate && !isCommand) || isProcessCmd || isPromptCmd || isMentioned);

  // In secretary mode (business messages), we ONLY process voice messages and video notes (circles)

  // Check voice, audio, video_note, video, document.
  // Track which message physically contains the file so we can cite it correctly in the reply.
  const voiceFromReply = canPickReplyAudio && isExplicit ? message.reply_to_message?.voice : null;
  const voiceObj = message.voice || voiceFromReply;
  const audioFromReply = (!isBusinessMsg && canPickReplyAudio && isExplicit) ? message.reply_to_message?.audio : null;
  const audioObj = (!isBusinessMsg && message.audio && (!requiresExplicit || isExplicit)) ? message.audio : audioFromReply;
  const videoNoteFromReply = canPickReplyAudio && isExplicit ? message.reply_to_message?.video_note : null;
  const videoNoteObj = message.video_note || videoNoteFromReply;
  const videoFromReply = (!isBusinessMsg && canPickReplyAudio && isExplicit) ? message.reply_to_message?.video : null;
  const videoObj = (!isBusinessMsg && message.video && (!requiresExplicit || isExplicit)) ? message.video : videoFromReply;
  const documentFromReply = (!isBusinessMsg && canPickReplyAudio && isExplicit) ? message.reply_to_message?.document : null;
  const documentObj = (!isBusinessMsg && message.document && (!requiresExplicit || isExplicit)) ? message.document : documentFromReply;

  // The message that physically contains the file — used as the reply target so the bot cites the audio.
  // Case 1 (reply-to): file is in reply_to_message. Case 2 (direct): file is in message itself.
  const fileSourceMessage = (voiceFromReply || audioFromReply || videoNoteFromReply || videoFromReply || documentFromReply)
    ? message.reply_to_message
    : message;

  let fileId = null;
  let fileUniqueId = null;
  let fileSize = 0;
  let fileDuration = 0;
  let fileType = '';
  let isInvalidDocument = false;
  let isUnsupportedVideo = false;

  if (voiceObj) {
    fileId = voiceObj.file_id;
    fileUniqueId = voiceObj.file_unique_id;
    fileSize = voiceObj.file_size || 0;
    fileDuration = voiceObj.duration || 0;
    fileType = 'voice';
  } else if (audioObj) {
    fileId = audioObj.file_id;
    fileUniqueId = audioObj.file_unique_id;
    fileSize = audioObj.file_size || 0;
    fileDuration = audioObj.duration || 0;
    fileType = 'audio';
  } else if (videoNoteObj) {
    fileId = videoNoteObj.file_id;
    fileUniqueId = videoNoteObj.file_unique_id;
    fileSize = videoNoteObj.file_size || 0;
    fileDuration = videoNoteObj.duration || 0;
    fileType = 'video_note';
  } else if (videoObj) {
    const mime = videoObj.mime_type || '';
    const name = videoObj.file_name || '';
    if (isUnsupportedVideoFile(mime, name)) {
      isUnsupportedVideo = true;
    } else {
      fileId = videoObj.file_id;
      fileUniqueId = videoObj.file_unique_id;
      fileSize = videoObj.file_size || 0;
      fileDuration = videoObj.duration || 0;
      fileType = 'video';
    }
  } else if (documentObj) {
    // Validate document file format
    const mime = documentObj.mime_type || '';
    const name = documentObj.file_name || '';
    const isSupportedMedia = mime.startsWith('audio/') || 
                             mime.startsWith('video/') || 
                             /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|oga|opus|flac|amr|awb|gsm|caf|aac|al|alaw|ul|ulaw|mulaw)$/i.test(name);
    if (isSupportedMedia) {
      if (isUnsupportedVideoFile(mime, name)) {
        isUnsupportedVideo = true;
      } else {
        fileId = documentObj.file_id;
        fileUniqueId = documentObj.file_unique_id;
        fileSize = documentObj.file_size || 0;
        fileType = 'document';
      }
    } else {
      isInvalidDocument = true;
    }
  }

  const currentLang = getUserLang(settings, langCode);

  if (isUnsupportedVideo) {
    const errorText = getMarkdown(currentLang, 'unsupportedVideo');
    await sendReply(token, update, message, errorText, fileSourceMessage !== message ? fileSourceMessage : undefined);
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  if (isInvalidDocument) {
    const errorText = getMarkdown(currentLang, 'notAudioFile');
    await sendReply(token, update, message, errorText, fileSourceMessage !== message ? fileSourceMessage : undefined);
    return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
  }

  const isAutoBusinessMedia = isBusinessMsg && fileId && !isProcessCmd && !isPromptCmd && !isMentioned;
  if (isAutoBusinessMedia && fileUniqueId) {
    if (lastProcessedBusinessFileUniqueId === fileUniqueId) {
      console.log(`Skipping duplicate business media message (already processed: ${fileUniqueId}).`);
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
    }
    lastProcessedBusinessFileUniqueId = fileUniqueId;
  }

  const privateChatId = coreSecretaryPrivateChat;
  const processTask = async () => {
    try {
      // Immediately show "typing..." status to the user
      const typingPayload = privateChatId
        ? { chat_id: privateChatId, action: 'typing' }
        : { chat_id: chatId, action: 'typing', ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) };
      callTelegram(token, 'sendChatAction', typingPayload).catch(() => {});

      if (fileId) {
        let responseText;
        if (!config.whisperApiKey) {
          console.warn('Whisper API key is missing. Skipping transcription.');
          responseText = getMarkdown(currentLang, 'apiKeyMissing', { key: 'WHISPER_API_KEY' });
          await sendReply(token, update, message, responseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
        } else if (fileSize > MAX_FILE_SIZE) {
          console.warn(`File is too large: ${fileSize} bytes. Skipping.`);
          responseText = getMarkdown(currentLang, 'fileTooLarge', { max_mb: MAX_MB });
          await sendReply(token, update, message, responseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
        } else {
          console.log(`Starting transcription for file_id: ${fileId} (type: ${fileType})`);
          const startTime = Date.now();
          const transResult = await transcribeAudio(fileId, config, settings, overridePrompt);
          const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
          
          if (transResult.ok) {
            const isGuest = !!(message.guest_query_id || update.guest_message?.guest_query_id);
            const messages = buildTranscriptionMessages(transResult.text, {
              header: getMarkdown(currentLang, 'transcription'),
              isGuest,
              guestWarningText: getTranslation(currentLang, 'guestWarning'),
              verbose: settings.verbose,
              fileType,
              fileSize,
              fileDuration,
              durationSec,
              actualFormat: transResult.actualFormat,
              signatureFormat: transResult.signatureFormat,
              wasConverted: transResult.wasConverted,
              whisperDuration: transResult.whisperDuration,
              instanceStart: formatTimePart(INSTANCE_START_TIME),
              instanceUptime: instanceUptimeAtStart,
              model: transResult.model,
              language: transResult.language
            });
            for (let i = 0; i < messages.length; i++) {
              const chunkResponseText = messages[i];
              
              // For subsequent chunks, clear the guest_query_id to send regular messages (as answerGuestQuery can only be called once)
              const currentUpdate = i === 0 ? update : (() => {
                const nextUpdate = { ...update };
                if (nextUpdate.guest_message) {
                  nextUpdate.guest_message = { ...nextUpdate.guest_message };
                  delete nextUpdate.guest_message.guest_query_id;
                }
                return nextUpdate;
              })();
              
              const currentMessage = i === 0 ? message : (() => {
                const nextMessage = { ...message };
                delete nextMessage.guest_query_id;
                return nextMessage;
              })();
              
              await sendReply(token, currentUpdate, currentMessage, chunkResponseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
            }
          } else {
            console.error(`Transcription failed: ${transResult.error}`);
            if (transResult.error === 'UNSUPPORTED_VIDEO_FORMAT') {
              responseText = getMarkdown(currentLang, 'unsupportedVideo');
            } else if (transResult.error === 'UNSUPPORTED_AUDIO_FORMAT') {
              responseText = getMarkdown(currentLang, 'notAudioFile');
            } else {
              const header = getMarkdown(currentLang, 'errorTranscription');
              responseText = `${header}\n\`\`\`json\n${escapeMarkdownV2Code(transResult.error)}\n\`\`\``;
              
              // Notify owner on transcription error if configured (and not triggered in owner's private chat)
              if (settings.notify_err && String(chatId) !== String(ownerId)) {
                const notifyLang = settings.langbot || 'en';
                const text = getMarkdown(notifyLang, 'notifyTransError', {
                  chat_id: String(chatId),
                  error: transResult.error
                });
                await notifyOwner(text, token, ownerId);
              }
            }
            await sendReply(token, update, message, responseText, fileSourceMessage !== message ? fileSourceMessage : undefined);
          }
        }
      } else {
        // No audio file found — handle based on how the bot was addressed
        if (isProcessCmd && message.reply_to_message) {
          // Directed to bot with a reply, but the replied message has no audio
          await sendReply(token, update, message, getMarkdown(currentLang, 'noAudio'), message.reply_to_message);
        } else if (await isMessageDirectedToBot(message, token, !!businessConnectionId)) {
          // Hand off text message to command processor
          const replyHelper = async (text, options = {}) => {
            let replyTo = undefined;
            if (options.replyToMessageId === null) {
              replyTo = null;
            } else if (options.replyToMessageId !== undefined) {
              replyTo = { message_id: options.replyToMessageId };
            }
            return await sendReply(token, update, message, text, replyTo);
          };
          await handleCommand(message, config, baseUrl, replyHelper);
        }
      }
    } catch (e) {
      console.error('Error in deferred message update task:', e);
      
      const errorMsg = e.message || String(e);
      const isUserBlocked = isUserSpaceError(errorMsg);
                            
      // 1. Notify the user about the error (sent directly to chat without reply targets)
      let userNotificationFailed = false;
      if (!isUserBlocked) {
        try {
          const userErrHeader = getMarkdown(currentLang, 'error');
          const errorStack = e.stack || errorMsg;
          const userErrText = `${userErrHeader}\n\`\`\`\n${escapeMarkdownV2Code(errorStack)}\n\`\`\``;
          
          await sendReply(token, update, message, userErrText, null).catch(err => {
            console.error('Failed to deliver error message to user:', err.message || err);
            userNotificationFailed = true;
          });
        } catch (userErr) {
          console.error('Failed to format error message for user:', userErr);
          userNotificationFailed = true;
        }
      }

      // 2. Notify the owner as configured
      try {
        if (settings && settings.notify_err && ownerId && !isUserBlocked && (String(chatId) !== String(ownerId) || userNotificationFailed)) {
          const notifyLang = settings.langbot || 'en';
          let contextInfo = `*Chat ID:* \`${escapeMarkdownV2(String(chatId))}\``;
          if (message.from) {
            contextInfo += `\n*User:* ${formatUserMarkdown(message.from)}`;
          }
          if (businessConnectionId) {
            contextInfo += `\n*Business Connection:* \`${escapeMarkdownV2(businessConnectionId)}\``;
          }
          
          const errorStack = e.stack || errorMsg;
          const text = getMarkdown(notifyLang, 'notifyUpdateError', {
            context: contextInfo,
            error: errorStack
          });
          await notifyOwner(text, token, ownerId);

        }
      } catch (err) {
        console.error('Failed to notify owner about critical error:', err);
      }
    } finally {
      // No cleanup needed for a single variable cache
    }
  };

  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(processTask());
  } else {
    await processTask();
  }

  return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: 'OK' };
}

/**
 * Handle incoming webhook request.
 */
export async function handleWebhook(requestInfo, config, executionCtx) {
  return frameworkWebhook(requestInfo, config, executionCtx);
}

/**
 * Normalized Telegram Webhook Setup Handler.
 */
const setupHandler = makeWebhookSetupHandler({
  parseWebhookConfig,
  buildWebhookSetup,
  getDefaultSettings: () => ({ ...DEFAULT_WEBHOOK_SETTINGS }),
  onAfterSetup: async ({ token }) => {
    const { setupBotProfile } = await import('./commands.js');
    await setupBotProfile(token);
  }
});

export async function handleSetup(requestInfo, config) {
  return await setupHandler(requestInfo, config);
}

/**
 * Create a standard config object.
 */
export function createConfig(env = {}) {
  const getEnv = (key) => getRuntimeEnv(key, env);
  return {
    telegramBotToken: getEnv("TELEGRAM_BOT_TOKEN"),
    whisperApiKey: getEnv("WHISPER_API_KEY"),
    whisperApiBase: getEnv("WHISPER_API_BASE"),
    whisperModels: getEnv("WHISPER_MODELS"),
    whisperPrompt: getEnv("WHISPER_PROMPT"),
    transcribeTimeout: parseInt(getEnv("TRANSCRIBE_TIMEOUT") || '', 10) || undefined,
    ownerChatId: undefined, // Dynamically parsed from webhook URL
    webhookBaseUrl: getEnv("WEBHOOK_BASE_URL"),
    allowedOwner: getEnv("OWNER"),
    allowedUsers: (getEnv("ALLOWED_USERS") || '').split(',').map(v => v.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
    version: getEnv("BOT_VERSION") || '0.0.0'
  };
}

export async function handleHealthCheck(requestInfo = {}, config = {}) {
  return frameworkHealthCheck(requestInfo, config, async () => {
    let aacOk = false;
    try {
      const dummy = new Uint8Array([0xFF, 0xF1]);
      aacOk = isAdtsAac(dummy);
    } catch {
      // Ignore error
    }
    return {
      ok: aacOk,
      config_checks: {
        whisperApiKey: !!config.whisperApiKey,
        ownerChatId: !!config.ownerChatId,
        whisperApiBase: config.whisperApiBase || DEFAULT_API_BASE
      },
      tests: {
        aac_detection: { ok: aacOk }
      }
    };
  });
}
