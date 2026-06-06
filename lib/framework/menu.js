// lib/framework/menu.js
// Generalized menu system for Telegram bots

import { callTelegram, isOwner } from './utils.js';
import { escapeMarkdownV2, stripMarkdown } from './markdown.js';

function cleanButtonText(str) {
  if (!str) return '';
  return stripMarkdown(String(str).split('\n')[0])
    .replace(/:$/, '')
    .trim();
}

export const MENU_REGISTRY = {};
/** @type {Map<number, {messageId: number, menuId: string, backMenuId: string|null}>} */
export const LAST_MENU = new Map();

let options = {
  loadSettings: async (_token) => ({}),
  saveSettings: async (_token, _baseUrl, _settings) => ({ ok: true }),
  getUserLang: (_settings, _userLangCode) => 'en',
  getTranslation: (_lang, key, _params) => key
};

export function configureMenuFramework(opts) {
  options = { ...options, ...opts };
}

const UI = {
  CHECK_ON: '✅',
  CHECK_OFF: '❌',
  RADIO_ON: '★',
  RADIO_OFF: '  ',
  STYLE_ACTIVE: { style: 'primary' },
  STYLE_DISABLED: { style: 'danger' }
};

/**
 * Basic button decorator
 */
export function makeBtn(text, callbackData, isActive, isDanger = false, isSuccess = false) {
  return {
    text,
    callback_data: callbackData,
    ...(isDanger ? UI.STYLE_DISABLED : (isSuccess ? { style: 'success' } : (isActive ? UI.STYLE_ACTIVE : {})))
  };
}

/**
 * Radio selection button
 */
export function makeRadioBtn(label, value, activeValue, callbackData) {
  const isActive = value === activeValue;
  return makeBtn(
    `${isActive ? UI.RADIO_ON : UI.RADIO_OFF} ${label}`,
    callbackData,
    isActive
  );
}

/**
 * Checkbox button
 */
export function makeCheckboxBtn(label, isChecked, callbackData, isDanger = false, isActive = undefined) {
  const activeStyle = isActive !== undefined ? isActive : (isChecked && !isDanger);
  return makeBtn(
    `${isChecked ? UI.CHECK_ON : UI.CHECK_OFF} ${label}`,
    callbackData,
    activeStyle,
    isDanger
  );
}

/**
 * Register a menu
 */
export function registerMenu(id, config) {
  MENU_REGISTRY[id] = config;
}

/**
 * Render the inline keyboard for a given menu.
 */
export function renderMenuKeyboard(menuId, settings, lang, ctx, backMenuId = null) {
  const menu = MENU_REGISTRY[menuId];
  if (!menu) return { inline_keyboard: [] };

  const mainMenuId = Object.keys(MENU_REGISTRY).find(id => MENU_REGISTRY[id]?.isMain) || null;
  const isCurrentMain = menu.isMain === true;

  const rawButtons = menu.getButtons ? menu.getButtons(settings, lang, ctx) : [];
  const keyboard = [];

  for (const row of rawButtons) {
    const kbRow = [];
    for (const btn of row) {
      if (btn.type === 'menu') {
        const subMenu = MENU_REGISTRY[btn.menuId];
        let title = btn.text;
        if (!title && subMenu) {
          const subTitle = cleanButtonText(subMenu.getTitle(settings, lang, ctx));
          const value = subMenu.getValue ? subMenu.getValue(settings, lang, ctx) : null;
          title = value ? `${subTitle}: ${value}` : subTitle;
        } else {
          title = cleanButtonText(title);
        }
        kbRow.push(makeBtn(title || btn.menuId, `nav:${btn.menuId}:${menuId}`, false));
      } else if (btn.type === 'toggle') {
        const isChecked = btn.isChecked !== undefined ? btn.isChecked : btn.isActive;
        kbRow.push(makeCheckboxBtn(cleanButtonText(btn.text), isChecked, `${menuId}:${btn.action}:${btn.value}`, btn.isDanger, btn.isActive));
      } else if (btn.type === 'radio') {
        kbRow.push(makeRadioBtn(cleanButtonText(btn.text), btn.value, btn.activeValue, `${menuId}:${btn.action}:${btn.value}`));
      } else { // action
        if (btn.switch_inline_query_current_chat !== undefined) {
          kbRow.push({
            text: cleanButtonText(btn.text),
            switch_inline_query_current_chat: btn.switch_inline_query_current_chat,
            ...(btn.isActive ? UI.STYLE_ACTIVE : {})
          });
        } else {
          kbRow.push(makeBtn(cleanButtonText(btn.text), `${menuId}:${btn.action}:${btn.value}`, btn.isActive, btn.isDanger));
        }
      }
    }
    keyboard.push(kbRow);
  }

  if (backMenuId !== false) {
    const navRow = [];

    // 1. Back button (pointing to backMenuId if it is a string and different from current menu)
    if (typeof backMenuId === 'string' && backMenuId && backMenuId !== menuId) {
      const backTitle = options.getTranslation(lang, 'btnBack') || '« Back';
      navRow.push(makeBtn(backTitle, `nav:${backMenuId}:`, false, false, true));
    }

    // 2. Close button (shown in main menu or when backMenuId is null/standalone)
    if (backMenuId === null || isCurrentMain) {
      const closeTitle = options.getTranslation(lang, 'btnClose') || 'Close';
      navRow.push(makeBtn(closeTitle, 'nav:close', false, true, false));
    }

    // 3. Main button (pointing to main menu if current menu is not main, and we didn't just come from main)
    if (!isCurrentMain && backMenuId !== mainMenuId) {
      const mainTitle = options.getTranslation(lang, 'btnMain') || 'Main';
      navRow.push(makeBtn(mainTitle, `nav:${mainMenuId}:`, false, false, true));
    }

    if (navRow.length > 0) {
      keyboard.push(navRow);
    }
  }

  return { inline_keyboard: keyboard };
}

/**
 * Get the text and inline keyboard for a menu.
 */
export async function getMenuTextAndKeyboard(menuId, settings, lang, ctx, backMenuId = null) {
  const menu = MENU_REGISTRY[menuId];
  if (!menu) return null;
  
  if (menu.prepare) {
    await menu.prepare(settings, lang, ctx);
  }

  const title = menu.getTitle(settings, lang, ctx);
  const text = menu.getText ? menu.getText(settings, lang, ctx) : '';
  
  let messageText = `*${escapeMarkdownV2(title.replace(/\*/g, ''))}*`;
  if (text) {
    messageText += `\n\n${text.trimStart()}`;
  }
  
  const replyMarkup = renderMenuKeyboard(menuId, settings, lang, ctx, backMenuId);

  return { text: messageText, replyMarkup };
}

/**
 * Open a menu as a new message.
 */
export async function openMenu(menuId, token, chatId, settings, lang, ctx, backMenuId = null) {
  const data = await getMenuTextAndKeyboard(menuId, settings, lang, ctx, backMenuId);
  if (!data) return false;

  const res = await callTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text: data.text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    reply_markup: data.replyMarkup
  });
  if (!res.ok) {
    throw new Error(`Telegram API sendMessage failed: ${res.description || 'Unknown error'}`);
  }
  if (res.result?.message_id) {
    LAST_MENU.set(chatId, { messageId: res.result.message_id, menuId, backMenuId: backMenuId !== undefined ? backMenuId : null });
  }
  return res;
}

/**
 * Update an existing menu in place.
 */
export async function updateMenu(menuId, token, messageId, chatId, settings, lang, ctx, backMenuId = null, noFallback = false) {
  const data = await getMenuTextAndKeyboard(menuId, settings, lang, ctx, backMenuId);
  if (!data) return false;

  const res = await callTelegram(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: data.text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    reply_markup: data.replyMarkup
  });
  if (!res.ok) {
    if (res.description && res.description.includes('message is not modified')) {
      return { ok: true, result: { message_id: messageId } };
    }
    if (res.description && res.description.includes('message to edit not found')) {
      LAST_MENU.delete(chatId);
      if (noFallback) {
        return { ok: false, error: 'message to edit not found' };
      }
      return openMenu(menuId, token, chatId, settings, lang, ctx, backMenuId);
    }
    throw new Error(`Telegram API editMessageText failed: ${res.description || 'Unknown error'}`);
  }
  if (messageId) {
    LAST_MENU.set(chatId, { messageId, menuId, backMenuId: backMenuId !== undefined ? backMenuId : null });
  }
  return res;
}

/**
 * Helper to update a menu if it's already open, or open a new one.
 */
export async function openOrUpdateMenu(menuId, token, chatId, settings, lang, ctx, triggerMessageId = null) {
  const cached = LAST_MENU.get(chatId);
  const menuMessageId = (cached?.menuId === menuId) ? cached.messageId : null;
  const backMenuId = (cached && cached.backMenuId !== undefined) ? cached.backMenuId : null;

  if (menuMessageId) {
    const res = await updateMenu(menuId, token, menuMessageId, chatId, settings, lang, ctx, backMenuId, true);
    if (res && res.ok) {
      if (triggerMessageId) {
        await callTelegram(token, 'deleteMessage', { chat_id: chatId, message_id: triggerMessageId }).catch(console.error);
      }
      return { updated: true, res };
    }
  }

  const res = await openMenu(menuId, token, chatId, settings, lang, ctx);
  return { updated: false, res };
}

/**
 * Extract the backMenuId from the current message's inline keyboard to preserve navigation state.
 */
export function getBackMenuId(message) {
  if (!message || !message.reply_markup || !message.reply_markup.inline_keyboard) return null;
  for (const row of message.reply_markup.inline_keyboard) {
    for (const btn of row) {
      if (btn.callback_data && btn.callback_data.startsWith('nav:')) {
        const parts = btn.callback_data.split(':');
        if (parts.length >= 3 && parts[2] === '') {
          return parts[1];
        }
      }
    }
  }
  return null;
}

/**
 * Core handler for menu callbacks.
 */
async function handleMenuCallback(callbackQuery, settings, lang, ctx, baseUrl) {
  const token = ctx.token;
  const callbackQueryId = callbackQuery.id;
  const message = callbackQuery.message;
  const messageId = message.message_id;
  const chatId = message.chat.id;
  const data = callbackQuery.data;

  const cached = LAST_MENU.get(chatId);
  const backMenuId = (cached && cached.messageId === messageId && cached.backMenuId !== undefined)
    ? cached.backMenuId
    : getBackMenuId(message);

  // Always refresh the menu cache when the user interacts with any button.
  // The current menuId is extracted from the callback_data prefix (e.g. "lang:set:auto" → "lang").
  if (messageId && chatId) {
    const currentMenuId = data.startsWith('nav:') ? data.split(':')[1] : data.substring(0, data.indexOf(':'));
    LAST_MENU.set(chatId, { messageId, menuId: currentMenuId || '', backMenuId });
  }

  if (data.startsWith('nav:')) {
    const parts = data.split(':');
    const targetMenuId = parts[1];
    if (targetMenuId === 'close') {
      await callTelegram(token, 'deleteMessage', { chat_id: chatId, message_id: messageId }).catch(console.error);
      await callTelegram(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId });
      LAST_MENU.delete(chatId);
      return true;
    }
    // parts[2] === '' means Back was explicitly cleared (top-level nav). Only fall back to
    // backMenuId when no backMenuId segment was provided at all (parts.length < 3).
    const navBackMenuId = parts.length >= 3 ? (parts[2] || null) : (backMenuId || null);
    await updateMenu(targetMenuId, token, messageId, chatId, settings, lang, ctx, navBackMenuId);
    await callTelegram(token, 'answerCallbackQuery', { callback_query_id: callbackQueryId });
    return true;
  }

  const colonIdx = data.indexOf(':');
  if (colonIdx === -1) return false;

  const menuId = data.substring(0, colonIdx);
  const actionValue = data.substring(colonIdx + 1);
  const secondColonIdx = actionValue.indexOf(':');
  if (secondColonIdx === -1) return false;

  const action = actionValue.substring(0, secondColonIdx);
  const value = actionValue.substring(secondColonIdx + 1);

  const menu = MENU_REGISTRY[menuId];
  if (!menu || !menu.handleAction) return false;

  const res = await menu.handleAction(action, value, settings, ctx);
  if (!res) return false;

  if (res.handled) return true;

  if (res.updated || res.refreshed) {
    if (menu.onUpdated) {
      await menu.onUpdated(settings, ctx);
      lang = ctx.lang || lang;
    }

    if (res.updated) {
      const updateRes = await options.saveSettings(token, baseUrl, settings);
      if (!updateRes.ok) {
        const errorMsg = options.getTranslation(lang, 'webhookUpdateFailed', { error: updateRes.error || JSON.stringify(updateRes) });
        await callTelegram(token, 'answerCallbackQuery', {
          callback_query_id: callbackQueryId
        }).catch(() => {});
        throw new Error(errorMsg);
      }
    }

    await updateMenu(menuId, token, messageId, chatId, settings, lang, ctx, backMenuId);
    
    if (res.updated) {
      await callTelegram(token, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: options.getTranslation(lang, 'settingsUpdated') || 'Updated'
      });
    }
  }

  return true;
}

/**
 * Handle Callback Queries from inline buttons.
 */
export async function handleCallbackQuery(callbackQuery, config, baseUrl, getExtraCtx = null) {
  const token = config.telegramBotToken;
  const callbackQueryId = callbackQuery.id;
  const fromId = callbackQuery.from.id;
  const message = callbackQuery.message;
  
  let settings;
  try {
    settings = await options.loadSettings(token);
  } catch (e) {
    console.error('Failed to load settings in callback query:', e);
    await callTelegram(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId
    }).catch(() => {});
    throw e;
  }

  const lang = options.getUserLang(settings, callbackQuery.from?.language_code);
  const ownerId = config.ownerChatId || settings.owner;

  if (!isOwner(fromId, ownerId)) {
    await callTelegram(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: options.getTranslation(lang, 'unauthorized'),
      show_alert: true
    });
    return true;
  }

  const ctx = {
    token,
    message,
    callbackQueryId,
    lang,
    config,
    baseUrl,
    ...(getExtraCtx ? getExtraCtx(callbackQuery, settings, lang) : {})
  };

  try {
    return await handleMenuCallback(callbackQuery, settings, lang, ctx, baseUrl);
  } catch (e) {
    console.error('Error handling menu callback:', e);
    await callTelegram(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId
    }).catch(() => {});
    throw e;
  }
}
