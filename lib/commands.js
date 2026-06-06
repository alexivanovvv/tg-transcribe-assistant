// lib/commands.js
// Interactive commands and stateless settings manager for Telegram Voice Transcribot

import { getTranslation, getMarkdown, REPO_URL, getUserLang, translations } from './localize.js';
import { callTelegram, isOwner, sendMarkdownMessage } from './framework/utils.js';
import { toMarkdownV2, stripMarkdown } from './framework/markdown.js';
import { formatUserMarkdown, MAX_PROMPT_TOKENS, truncateTokensFromLeft } from './utils.js';

import { getWebhookConfig, updateWebhookConfig } from './webhook-settings.js';
import { COMMAND_REGISTRY, registerCommand, generateHelpText as frameworkHelp } from './framework/router.js';
import { setupBotProfile as setupFrameworkBotProfile, setupBotAvatar as setupFrameworkBotAvatar } from './framework/bot-profile.js';
const HEALTH_CHECK_TIMEOUT = 5000;

export const BOT_COMMANDS = new Proxy(COMMAND_REGISTRY, { 
  get(target, prop) { 
    const arr = target.filter(c => c.descriptionKey && !c.hidden).sort((a, b) => a.command.localeCompare(b.command));
    if (prop === 'length') return arr.length; 
    return typeof arr[prop] === 'function' ? arr[prop].bind(arr) : arr[prop]; 
  }
});



async function handleHelpCommand(message, ctx) {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  
  const greetingText = getMarkdown(lang, 'help');
  const settingsTitle = getMarkdown(lang, 'settingsTitle');
  const responseText = frameworkHelp(ctx.isMsgFromOwner, lang, ctx.config.version, greetingText, settingsTitle, getTranslation);
  
  await setupBotCommands(ctx.token, ctx.chatId, ctx.isMsgFromOwner, lang).catch(console.error);
  
  const reply = ctx.reply || (async (text, options = {}) => {
    return await sendMarkdownMessage(ctx.token, ctx.chatId, text, {
      replyToMessageId: options.replyToMessageId
    });
  });

  const res = await reply(responseText, { replyToMessageId: null });
  if (!res.ok) throw new Error(`Failed to send help message: ${res.description || 'Unknown error'}`);
  return true;
}


// Register basic commands
registerCommand('help', handleHelpCommand, { priority: 100, isAdmin: false, descriptionKey: 'cmdHelp' });
registerCommand('start', async (message, ctx) => {
  if (!ctx.isMsgFromOwner) {
    const from = message.from || {};
    const logUserInfo = [
      from.first_name || '',
      from.last_name || '',
      from.username ? `@${from.username}` : '',
      from.id ? `(ID: ${from.id})` : ''
    ].filter(Boolean).join(' ');

    console.log(`Non-owner start: User: ${logUserInfo}, Chat ID: ${ctx.chatId}`);

    const settings = await getWebhookConfig(ctx.token);
    const notifyLang = settings.langbot || 'en';
    const notifyText = getMarkdown(notifyLang, 'notifyNonOwnerStart', {
      raw_user: formatUserMarkdown(from),
      chat_id: String(ctx.chatId)
    });

    await callTelegram(ctx.token, 'sendMessage', {
      chat_id: ctx.ownerId,
      text: notifyText,
      parse_mode: 'MarkdownV2'
    }).catch(err => console.error('Failed to notify owner about non-owner start:', err));
  }
  return await handleHelpCommand(message, ctx);
}, { priority: 100, isAdmin: false, hidden: true });



registerCommand('readme', REPO_URL, { isAdmin: false, descriptionKey: 'cmdReadme' });


registerCommand('process', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  const reply = ctx.reply || (async (text) => {
    return await sendMarkdownMessage(ctx.token, ctx.chatId, text, {
      replyToMessageId: message.message_id,
      businessConnectionId: message.business_connection_id
    });
  });
  const res = await reply(getMarkdown(lang, 'noAudio'));
  if (!res.ok) throw new Error(`Failed to send noAudio warning: ${res.description || 'Unknown error'}`);
  return true;
}, { isAdmin: false, descriptionKey: 'cmdProcess', requiresReply: true });


// User prompt command (media transcription fallback) - priority 100
registerCommand('prompt', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  const reply = ctx.reply || (async (text) => {
    return await sendMarkdownMessage(ctx.token, ctx.chatId, text, {
      replyToMessageId: message.message_id,
      businessConnectionId: message.business_connection_id
    });
  });
  const res = await reply(getMarkdown(lang, 'noAudio'));
  if (!res.ok) throw new Error(`Failed to send noAudio warning: ${res.description || 'Unknown error'}`);
  return true;
}, { priority: 100, isAdmin: false, descriptionKey: 'cmdPromptUser', requiresReply: true });


registerCommand('webhook', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  const commandArg = ctx.commandArg;
  const token = ctx.token;
  const chatId = ctx.chatId;

  if (commandArg) {
    let newBase;
    const overrideParams = {};
    try {
      const parsedArg = new URL(commandArg);
      newBase = parsedArg.origin;
      parsedArg.searchParams.forEach((v, k) => { overrideParams[k] = v; });
    } catch {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookHealthFail', { url: commandArg, error: getTranslation(lang, 'errInvalidUrlFormat') }),
        parse_mode: 'MarkdownV2'
      });

      return true;
    }

    await callTelegram(token, 'sendMessage', {
      chat_id: chatId,
      text: getMarkdown(lang, 'webhookHealthChecking'),
      parse_mode: 'MarkdownV2'
    });

    const healthUrl = `${newBase}/api/health`;
    let healthOk = false;
    let healthError = '';
    try {
      const hRes = await fetch(healthUrl, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT) });
      if (hRes.ok || hRes.status === 200) {
        healthOk = true;
      } else {
        healthError = getTranslation(lang, 'errHttpStatus', { status: String(hRes.status) });

      }
    } catch (e) {
      healthError = e.message || String(e);
    }

    if (!healthOk) {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookHealthFail', { url: healthUrl, error: healthError }),
        parse_mode: 'MarkdownV2'
      });
      return true;
    }

    const mergedSettings = { ...settings, ...overrideParams };
    const res = await updateWebhookConfig(token, newBase, mergedSettings);
    if (res.ok) {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookHealthOk', { url: `${newBase}/api/webhook` }),
        parse_mode: 'MarkdownV2'
      });
    } else {
      await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: getMarkdown(lang, 'webhookUpdateFailed', { error: res.error || JSON.stringify(res) }),
        parse_mode: 'MarkdownV2'
      });
    }
  } else {
    const { openMenu } = await import('./framework/menu.js');
    await openMenu('webhook', token, chatId, settings, lang, ctx);
  }
  return true;
}, { condition: (message, isMsgFromOwner) => isMsgFromOwner, isAdmin: true, descriptionKey: 'cmdWebhook', hidden: true });

registerCommand('setbotinfo', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  await setupBotProfile(ctx.token);
  await setupBotAvatar(ctx.token);
  await callTelegram(ctx.token, 'sendMessage', {
    chat_id: ctx.chatId,
    text: getMarkdown(lang, 'botInfoSuccess'),
    parse_mode: 'MarkdownV2'
  });
  return true;
}, { condition: (message, isMsgFromOwner) => isMsgFromOwner, isAdmin: true, descriptionKey: 'cmdSetbotinfo', hidden: true });


/**
 * Main handler for text commands.
 */
export async function handleCommand(message, config, baseUrl, replyHelper) {
  const token = config.telegramBotToken;
  const ownerId = config.ownerChatId;
  const chatId = message.chat.id;

  const defaultReplyHelper = async (text, options = {}) => {
    const replyToMessageId = options.replyToMessageId !== undefined ? options.replyToMessageId : message.message_id;
    return await sendMarkdownMessage(token, chatId, text, {
      replyToMessageId,
      businessConnectionId: message.business_connection_id
    });
  };
  const reply = replyHelper || defaultReplyHelper;

  let text = (message.text || '').trim();


    // If the command is sent via inline query completion, it starts with @username /command...
    // e.g. @botusername /lang fr -> strip the @botusername prefix so it parses correctly
    if (text.startsWith('@')) {
      const spaceIdx = text.indexOf(' ');
      if (spaceIdx !== -1) {
        const firstWord = text.substring(0, spaceIdx);
        if (!firstWord.includes('/')) {
          const rest = text.substring(spaceIdx + 1).trim();
          if (rest.startsWith('/')) {
            text = rest;
          }
        }
      }
    }

    const userId = message.from?.id;
    const isMsgFromOwner = isOwner(userId, ownerId);
    const userLangCode = message.from?.language_code;

    const cmdMatch = text.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+)?(?:\s+([\s\S]*))?$/);
    let matchedCmd = cmdMatch ? cmdMatch[1].toLowerCase() : null;
    let commandArg = cmdMatch ? (cmdMatch[2] || '').trim() : '';

    const botUsername = message.botUsername;
    if (!matchedCmd && botUsername && text.toLowerCase().startsWith(`@${botUsername.toLowerCase()}`)) {
      matchedCmd = 'process';
      const spaceIdx = text.indexOf(' ');
      commandArg = spaceIdx !== -1 ? text.substring(spaceIdx + 1).trim() : '';
    }

    if (!ownerId) {
      throw new Error('Owner Chat ID is not set in configuration');
    }

    const isFromClient = !!message.isFromClient;
    if (message.business_connection_id && !isFromClient) {
      if (matchedCmd) {
        console.warn(`Interlocutor ${userId} command /${matchedCmd} ignored in business connection chat`);
      }
      return true;
    }

    if (matchedCmd) {
      const handlers = COMMAND_REGISTRY.filter(h => h.command === matchedCmd);
      for (const h of handlers) {
        if (h.condition(message, isMsgFromOwner)) {
          if (h.isAdmin && (message.chat.type !== 'private' || message.business_connection_id)) {
            continue; // Admin commands are only active in private chats directly with the bot
          }
          if (h.requiresReply && !message.reply_to_message) {
            const settings = await getWebhookConfig(token);
            const lang = getUserLang(settings, userLangCode);
            const res = await reply(getMarkdown(lang, 'replyRequired'));
            if (!res.ok) throw new Error(`Failed to send replyRequired warning: ${res.description || 'Unknown error'}`);
            return true;
          }
          const res = await h.handler(message, {
            token,
            ownerId,
            chatId,
            commandArg,
            isMsgFromOwner,
            userLangCode,
            config,
            baseUrl,
            reply
          });
          if (res !== false) {
            return true;
          }
        }
      }
      if (!isMsgFromOwner && COMMAND_REGISTRY.some(c => c.command === matchedCmd && c.isAdmin) && !COMMAND_REGISTRY.some(c => c.command === matchedCmd && !c.isAdmin)) {
        console.warn(`Non-owner ${userId} tried to execute command /${matchedCmd}`);
        return true;
      }
    }

    // Fallback for private chats directly with the bot
    if (message.chat.type === 'private' && !message.business_connection_id) {
      const settings = await getWebhookConfig(token);
      const lang = getUserLang(settings, userLangCode);
      const helpText = generateHelpText(isMsgFromOwner, lang, config, true);
      
      await reply(helpText);
      return true;
    }

    return false;
}




/**
 * Dynamically compile the help text based on registered commands.
 */
export function generateHelpText(isMsgFromOwner, lang, config, isUnsolicited = false) {
  const greetingMarkdown = getMarkdown(lang, 'help');
  
  const userCmds = BOT_COMMANDS
    .filter(cmd => !cmd.isAdmin)
    .sort((a, b) => a.command.localeCompare(b.command));

  let cmdsList = '';
  for (const cmd of userCmds) {
    const desc = getTranslation(lang, cmd.descriptionKey) || cmd.command;
    cmdsList += `\n/${cmd.command} \\- ${toMarkdownV2(desc)}`;
  }

  if (isMsgFromOwner) {
    const settingsTitle = getMarkdown(lang, 'settingsTitle');
    cmdsList += `\n\n${settingsTitle}`;
    
    const adminCmds = BOT_COMMANDS
      .filter(cmd => cmd.isAdmin)
      .sort((a, b) => a.command.localeCompare(b.command));
      
    for (const cmd of adminCmds) {
      const desc = getTranslation(lang, cmd.descriptionKey) || cmd.command;
      cmdsList += `\n/${cmd.command} \\- ${toMarkdownV2(desc)}`;
    }
  }

  cmdsList = cmdsList.trim();
  let responseText = greetingMarkdown + '\n\n';

  if (isUnsolicited) {
    const lines = cmdsList.split('\n');
    responseText += '**>' + lines.join('\n>') + '||';
  } else {
    responseText += cmdsList;
    const versionStr = getMarkdown(lang, 'botVersion', { val: 'v' + (config.version || '0.0.0') });
    if (versionStr) {
      responseText += `\n\n${versionStr}`;
    }
  }

  return responseText;
}

/**
 * Configure the bot's command menu.
 */
export function getPublicCommands(langCode) {
  return BOT_COMMANDS
    .filter(cmd => !cmd.isAdmin)
    .map(cmd => {
      const rawDesc = getTranslation(langCode, cmd.descriptionKey) || cmd.command;
      return {
        command: cmd.command,
        description: stripMarkdown(rawDesc)
      };
    })
    .sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Get admin commands list.
 */
export function getAdminCommands(langCode) {
  const commandMap = new Map();
  for (const cmd of BOT_COMMANDS) {
    const existing = commandMap.get(cmd.command);
    if (!existing || cmd.isAdmin) {
      commandMap.set(cmd.command, cmd);
    }
  }
  return Array.from(commandMap.values())
    .map(cmd => {
      const rawDesc = getTranslation(langCode, cmd.descriptionKey) || cmd.command;
      return {
        command: cmd.command,
        description: stripMarkdown(rawDesc)
      };
    })
    .sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Configure the bot's command menu.
 */
export async function setupBotCommands(token, chatId, isMsgFromOwner, langCode = 'en') {
  const commands = isMsgFromOwner ? getAdminCommands(langCode) : getPublicCommands(langCode);

  const res = await callTelegram(token, 'setMyCommands', {
    commands,
    language_code: langCode,
    scope: {
      type: 'chat',
      chat_id: Number(chatId)
    }
  });
  if (!res.ok) {
    console.error(`Failed to set bot commands for chat ${chatId}:`, res);
  } else {
    console.log(`Bot commands updated successfully for chat ${chatId}.`);
  }
}

export async function setupBotProfile(token) {
  return await setupFrameworkBotProfile(token, {
    getTranslation,
    getTranslations: () => translations,
    getSettings: getWebhookConfig
  });
}

/**
 * Try to upload bot profile photo from local files (avatar.jpg, avatar.png, avatar.jpeg)
 * if they exist in the root of the project.
 */
export async function setupBotAvatar(token) {
  return await setupFrameworkBotAvatar(token);
}

export function makeMenuCommandHandler(menuId) {
  return async (message, ctx) => {
    const settings = await getWebhookConfig(ctx.token);
    const lang = getUserLang(settings, ctx.userLangCode);
    const botInfoRes = await callTelegram(ctx.token, 'getMe', {});
    ctx.botInfo = botInfoRes.ok ? botInfoRes.result : null;
    const webhookInfoRes = await callTelegram(ctx.token, 'getWebhookInfo', {});
    ctx.webhookUrl = webhookInfoRes.ok ? (webhookInfoRes.result?.url || '—') : '—';
    const { getAvailableModels } = await import('./menus.js');
    ctx.availableModels = getAvailableModels(ctx.config);
    ctx.lang = lang;
    
    const { openOrUpdateMenu } = await import('./framework/menu.js');

    if (ctx.commandArg) {
      if (menuId === 'lang') {
        const val = ctx.commandArg.toLowerCase();
        settings.lang = val;
        await updateWebhookConfig(ctx.token, ctx.baseUrl, settings);

        await openOrUpdateMenu('lang', ctx.token, ctx.chatId, settings, lang, ctx, message.message_id);
        return true;

      } else if (menuId === 'prompt') {
        const val = ctx.commandArg;
        if (val.toLowerCase() === 'default') {
          settings.prompt = undefined;
        } else if (val.toLowerCase() === 'empty' || val === '-') {
          settings.prompt = '';
        } else {
          // Check if text exceeds Whisper token limit before saving
          const truncated = truncateTokensFromLeft(val, MAX_PROMPT_TOKENS);
          if (truncated !== val) {
            // Notify the user and offer a trim button instead of silently truncating.
            // The active menu is left untouched.
            await callTelegram(ctx.token, 'sendMessage', {
              chat_id: ctx.chatId,
              text: getMarkdown(lang, 'promptTooLong', { max: String(MAX_PROMPT_TOKENS) }),
              parse_mode: 'MarkdownV2',
              reply_to_message_id: message.message_id,
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: getTranslation(lang, 'btnTruncatePrompt'),
                    switch_inline_query_current_chat: `/prompt ${truncated}`
                  }
                ]]
              }
            });
            return true;
          }
          settings.prompt = val;
        }
        await updateWebhookConfig(ctx.token, ctx.baseUrl, settings);
        
        await openOrUpdateMenu('prompt', ctx.token, ctx.chatId, settings, lang, ctx, message.message_id);
        return true;
      }
    }
    
    await openOrUpdateMenu(menuId, ctx.token, ctx.chatId, settings, lang, ctx);
    return true;
  };
}

registerCommand('config', makeMenuCommandHandler('config'), {
  condition: (message, isMsgFromOwner) => isMsgFromOwner,
  isAdmin: true,
  descriptionKey: 'cmdConfig'
});

registerCommand('settings', async (message, ctx) => {
  const settings = await getWebhookConfig(ctx.token);
  const lang = getUserLang(settings, ctx.userLangCode);
  
  if (!ctx.webhookUrl) {
    const webhookInfoRes = await callTelegram(ctx.token, 'getWebhookInfo', {});
    ctx.webhookUrl = webhookInfoRes.ok ? (webhookInfoRes.result?.url || '—') : '—';
  }
  if (!ctx.botInfo) {
    const botInfoRes = await callTelegram(ctx.token, 'getMe', {});
    ctx.botInfo = botInfoRes.ok ? botInfoRes.result : null;
  }
  
  const { cleanTitleText, TRANSCRIPTION_LANGUAGES, DEFAULT_MODELS, getAvailableModels } = await import('./menus.js');
  ctx.availableModels = getAvailableModels(ctx.config);
  ctx.lang = lang;

  const cleanTitleLocal = (key) => cleanTitleText(getTranslation(lang, key));
  const paramLang = cleanTitleLocal('langTitle');
  const paramModel = cleanTitleLocal('modelTitle');
  const paramPrompt = cleanTitleLocal('promptTitle');
  const paramLangBot = cleanTitleLocal('langbotTitle');
  const paramMode = cleanTitleLocal('modeTitle');
  const paramVerbose = cleanTitleLocal('verboseTitle');
  const paramNotify = cleanTitleLocal('notifyTitle');
  const paramWebhook = cleanTitleLocal('webhookTitle');

  const lbAuto = settings.autodetect !== false;
  const lbCode = settings.langbot === 'auto' ? 'en' : (settings.langbot || 'en');
  const langbotVal = lbAuto 
    ? (ctx.userLangCode ? `${getTranslation(lang, 'btnAuto')} (${ctx.userLangCode})` : getTranslation(lang, 'btnAuto')) 
    : (TRANSCRIPTION_LANGUAGES[lbCode] || lbCode.toUpperCase());

  const langVal = settings.lang === 'auto' ? getTranslation(lang, 'langAuto') : (TRANSCRIPTION_LANGUAGES[settings.lang] || String(settings.lang).toUpperCase());

  const models = ctx.availableModels || DEFAULT_MODELS;
  const modelVal = settings.model || models[0];

  let promptVal;
  if (settings.prompt === undefined) {
    promptVal = ctx.config?.whisperPrompt ? `${getTranslation(lang, 'promptDefault')}: "${ctx.config.whisperPrompt}"` : getTranslation(lang, 'promptEmpty');
  } else if (settings.prompt === '') {
    promptVal = getTranslation(lang, 'promptEmpty');
  } else {
    promptVal = `"${settings.prompt}"`;
  }

  const modesList = [];
  if (settings.groups === true) modesList.push(getTranslation(lang, 'btnGroups'));
  else if (settings.groups === 'leave') modesList.push(getTranslation(lang, 'btnGroups') + getTranslation(lang, 'btnAutoLeave'));
  if (settings.secretary) modesList.push(getTranslation(lang, 'btnSecretary'));
  if (settings.guest) modesList.push(getTranslation(lang, 'btnGuest'));
  const modesVal = modesList.length > 0 ? modesList.join(', ') : '—';

  const verboseVal = settings.verbose ? getTranslation(lang, 'btnOn') : getTranslation(lang, 'btnOff');

  const notifyList = [];
  if (settings.notify_add) notifyList.push(getTranslation(lang, 'btnGroupAdditions'));
  if (settings.notify_conn) notifyList.push(getTranslation(lang, 'btnSecretaryAdditions'));
  if (settings.notify_err) notifyList.push(getTranslation(lang, 'btnCriticalErrors'));
  const notifyVal = notifyList.length > 0 ? notifyList.join(', ') : '—';

  let webhookDomain = '—';
  if (ctx.webhookUrl && ctx.webhookUrl !== '—') {
    try {
      webhookDomain = new URL(ctx.webhookUrl).host;
    } catch {
      webhookDomain = ctx.webhookUrl;
    }
  }

  const colParam = getTranslation(lang, 'tableHeaderParameter');
  const colValue = getTranslation(lang, 'tableHeaderValue');

  const tableTitle = getTranslation(lang, 'settingsTitle');
  const esc = (val) => String(val).replace(/\|/g, '\\|');

  const tableMarkdown = [
    tableTitle,
    '',
    `| ${colParam} | ${colValue} |`,
    `| :--- | :--- |`,
    `| **${esc(paramLang)}** | ${esc(langVal)} |`,
    `| **${esc(paramModel)}** | \`${esc(modelVal)}\` |`,
    `| **${esc(paramPrompt)}** | ${esc(promptVal)} |`,
    `| **${esc(paramLangBot)}** | ${esc(langbotVal)} |`,
    `| **${esc(paramMode)}** | ${esc(modesVal)} |`,
    `| **${esc(paramVerbose)}** | ${esc(verboseVal)} |`,
    `| **${esc(paramNotify)}** | ${esc(notifyVal)} |`,
    `| **${esc(paramWebhook)}** | \`${esc(webhookDomain)}\` |`
  ].join('\n');

  let res = await callTelegram(ctx.token, 'sendRichMessage', {
    chat_id: ctx.chatId,
    rich_message: {
      markdown: tableMarkdown
    }
  });

  if (!res || !res.ok) {
    const errMsg = res ? (res.description || res.error || JSON.stringify(res)) : 'No response';
    console.warn(`[settings] sendRichMessage failed (${errMsg}), falling back to sendMessage MarkdownV2`);
    const { MENU_REGISTRY } = await import('./framework/menu.js');
    const fallbackText = `${tableTitle}\n\n` + MENU_REGISTRY['config'].getText(settings, lang, ctx);
    res = await callTelegram(ctx.token, 'sendMessage', {
      chat_id: ctx.chatId,
      text: fallbackText,
      parse_mode: 'MarkdownV2'
    });
  }

  if (!res.ok) {
    throw new Error(`Failed to send settings message: ${res.description || 'Unknown error'}`);
  }
  return true;
}, {
  condition: (message, isMsgFromOwner) => isMsgFromOwner,
  isAdmin: true,
  descriptionKey: 'cmdSettings'
});

// Admin prompt command (sets settings prompt globally) - priority 200, checks !message.reply_to_message
registerCommand('prompt', makeMenuCommandHandler('prompt'), {
  priority: 200,
  condition: (message, isMsgFromOwner) => isMsgFromOwner && !message.reply_to_message,
  isAdmin: true,
  descriptionKey: 'cmdPromptAdmin',
  hidden: true
});

const menuKeys = [
  { key: 'lang', desc: 'cmdLang' },
  { key: 'langbot', desc: 'cmdLangbot' },
  { key: 'mode', desc: 'cmdMode' },
  { key: 'model', desc: 'cmdModel' },
  { key: 'notify', desc: 'cmdNotify' },
  { key: 'verbose', desc: 'cmdVerbose' }
];
for (const item of menuKeys) {
  registerCommand(item.key, makeMenuCommandHandler(item.key), {
    condition: (message, isMsgFromOwner) => isMsgFromOwner,
    isAdmin: true,
    descriptionKey: item.desc,
    hidden: true
  });
}
