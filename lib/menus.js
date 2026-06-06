// lib/menus.js
// Menu registrations for Telegram Voice Transcribot

import { registerMenu, MENU_REGISTRY } from './framework/menu.js';
import { getTranslation, getMarkdown, translations, getUserLang } from './localize.js';
import { setupBotCommands } from './commands.js';
import { callTelegram } from './framework/utils.js';
import { escapeMarkdownV2 } from './framework/markdown.js';

export const DEFAULT_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];

/**
 * Get available models list.
 */
export function getAvailableModels(config) {
  const modelsEnv = config.whisperModels || '';
  if (modelsEnv) {
    return modelsEnv.split(',').map(m => m.trim()).filter(Boolean);
  }
  return DEFAULT_MODELS;
}

export const TRANSCRIPTION_LANGUAGES = {
  en: "🇬🇧 English",
  ru: "🇷🇺 Русский",
  de: "🇩🇪 Deutsch",
  uk: "🇺🇦 Українська",
  es: "🇪🇸 Español",
  fr: "🇫🇷 Français",
  it: "🇮🇹 Italiano",
  pt: "🇵🇹 Português",
  zh: "🇨🇳 中文",
};

export function cleanTitleText(str) {
  return (str || '')
    .split('\n')[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*/g, '')
    .replace(/:$/, '')
    .trim();
}

function cleanTitle(lang, key) {
  return cleanTitleText(getTranslation(lang, key));
}

registerMenu('config', {
  isMain: true,
  getTitle: (settings, lang) => getTranslation(lang, 'settingsTitle'),
  prepare: async (settings, lang, ctx) => {
    if (!ctx.webhookUrl) {
      const res = await callTelegram(ctx.token, 'getWebhookInfo', {});
      ctx.webhookUrl = res.ok ? (res.result?.url || '—') : '—';
    }
    if (!ctx.botInfo) {
      const freshRes = await callTelegram(ctx.token, 'getMe', {});
      ctx.botInfo = freshRes.ok ? freshRes.result : null;
    }
  },
  getText: (settings, lang, ctx) => {
    const esc = escapeMarkdownV2;
    const getVal = (id) => MENU_REGISTRY[id]?.getValue ? MENU_REGISTRY[id].getValue(settings, lang, ctx) : '—';
    const label = (key) => esc(cleanTitle(lang, key));

    const WHISPER_PROMPTING_GUIDE_URL = "https://developers.openai.com/cookbook/examples/whisper_prompting_guide";
    const modelLabel = getMarkdown(lang, 'modelTitle').split('\n')[0];

    const promptVal = getVal('prompt');
    const promptValStr = (settings.prompt !== undefined && settings.prompt !== '')
      ? `[${esc(getTranslation(lang, 'promptCustomLabel'))}](${WHISPER_PROMPTING_GUIDE_URL}): ${promptVal}`
      : promptVal;

    let webhookDomain = '—';
    if (ctx.webhookUrl && ctx.webhookUrl !== '—') {
      try {
        webhookDomain = new URL(ctx.webhookUrl).host;
      } catch {
        webhookDomain = ctx.webhookUrl;
      }
    }

    return [
      `• *${label('langTitle')}*: ${getVal('lang')}`,
      `• ${modelLabel} \`${esc(getVal('model'))}\``,
      `• *${label('promptTitle')}*: ${promptValStr}`,
      `• *${label('langbotTitle')}*: ${getVal('langbot')}`,
      `• *${label('modeTitle')}*: ${getVal('mode')}`,
      `• *${label('verboseTitle')}*: ${esc(getVal('verbose'))}`,
      `• *${label('notifyTitle')}*: ${getVal('notify')}`,
      `• *${label('webhookTitle')}*: \`${esc(webhookDomain)}\``
    ].join('\n');
  },
  getButtons: (settings, lang) => [
    [{ type: 'menu', menuId: 'lang', text: getTranslation(lang, 'langTitle') }],
    [{ type: 'menu', menuId: 'model', text: getTranslation(lang, 'modelTitle') }],
    [{ type: 'menu', menuId: 'prompt', text: getTranslation(lang, 'promptTitle') }],
    [{ type: 'menu', menuId: 'langbot', text: getTranslation(lang, 'langbotTitle') }],
    [{ type: 'menu', menuId: 'mode', text: getTranslation(lang, 'modeTitle') }],
    [{ type: 'menu', menuId: 'verbose', text: getTranslation(lang, 'verboseTitle') }],
    [{ type: 'menu', menuId: 'notify', text: getTranslation(lang, 'notifyTitle') }],
    [{ type: 'menu', menuId: 'webhook', text: getTranslation(lang, 'webhookTitle') }],
    [{ type: 'action', text: getTranslation(lang, 'btnSetbotinfo'), action: 'setbotinfo' }]
  ],
  handleAction: async (action, value, settings, ctx) => {
    if (action === 'setbotinfo') {
      const { setupBotProfile, setupBotAvatar } = await import('./commands.js');
      await setupBotProfile(ctx.token);
      await setupBotAvatar(ctx.token);
      await callTelegram(ctx.token, 'answerCallbackQuery', {
        callback_query_id: ctx.callbackQueryId,
        text: getTranslation(ctx.lang, 'botInfoSuccess'),
        show_alert: true
      });
      return { handled: true };
    }
    return { handled: true };
  }
});

registerMenu('mode', {
  getTitle: (settings, lang) => cleanTitle(lang, 'modeTitle'),
  getValue: (settings, lang, ctx) => {
    const esc = escapeMarkdownV2;
    const canGroups    = ctx?.botInfo?.can_join_groups !== false;
    const canSecretary = ctx?.botInfo?.can_connect_to_business === true;
    const canGuest     = ctx?.botInfo?.supports_guest_queries === true;

    const SECRETARY_URL = "https://t.me/TelegramTips/567";
    const GUEST_URL = "https://t.me/TelegramTips/565";

    const labelGroups = esc(getTranslation(lang, 'btnGroups'));
    const autoLeaveSuffix = esc(getTranslation(lang, 'btnAutoLeave'));
    let groupsStr;
    if (settings.groups === true) groupsStr = labelGroups;
    else if (settings.groups === 'leave') groupsStr = `~${labelGroups}~${autoLeaveSuffix}`;
    else groupsStr = `~${labelGroups}~`;

    // Append join-disabled badge when BotFather blocks new group additions
    if (!canGroups) {
      const joinDisabledLabel = esc(getTranslation(lang, 'btnGroupJoinShort'));
      groupsStr += ` \\(~${joinDisabledLabel}~\\)`;
    }

    const labelSec = esc(getTranslation(lang, 'btnSecretary'));
    const secStr = (settings.secretary && canSecretary)
      ? `[${labelSec}](${SECRETARY_URL})`
      : `~[${labelSec}](${SECRETARY_URL})~`;

    const labelGuest = esc(getTranslation(lang, 'btnGuest'));
    const guestStr = (settings.guest && canGuest)
      ? `[${labelGuest}](${GUEST_URL})`
      : `~[${labelGuest}](${GUEST_URL})~`;

    return `_${[groupsStr, secStr, guestStr].join(', ')}_`;
  },
  getText: (settings, lang) => {
    const desc = getMarkdown(lang, 'modeTitle').split('\n').slice(1).join('\n').trimStart();
    const footer = getMarkdown(lang, 'modeFooter');
    return desc + '\n\n' + footer;
  },
  prepare: async (settings, lang, ctx) => {
    const freshRes = await callTelegram(ctx.token, 'getMe', {});
    ctx.botInfo = freshRes.ok ? freshRes.result : null;
  },
  getButtons: (settings, lang, ctx) => {
    const canGroups    = ctx.botInfo?.can_join_groups !== false;
    const canSecretary = ctx.botInfo?.can_connect_to_business === true;
    const canGuest     = ctx.botInfo?.supports_guest_queries === true;

    function modeBtn(key, settingKey, capAllowed) {
      const label = getTranslation(lang, key);
      const currentState = settings[settingKey] === true ? 'on' : (settings[settingKey] === 'leave' ? 'leave' : 'off');
      const valueWithState = `${settingKey}:${currentState}`;

      if (!capAllowed) {
        return { type: 'action', text: `⚠️ ${label}`, action: 'disabled', value: valueWithState, isDanger: true };
      }
      return { type: 'toggle', text: label, action: 'toggle', value: valueWithState, isActive: settings[settingKey] === true };
    }

    // Groups toggle is always available — can_join_groups only affects new additions, not existing groups
    let groupsLabel = getTranslation(lang, 'btnGroups');
    if (settings.groups === 'leave') groupsLabel += getTranslation(lang, 'btnAutoLeave');
    const groupsState = settings.groups === true ? 'on' : (settings.groups === 'leave' ? 'leave' : 'off');
    const groupsToggle = {
      type: 'toggle',
      text: groupsLabel,
      action: 'toggle',
      value: `groups:${groupsState}`,
      isActive: settings.groups === true
    };

    const rows = [];

    // Informational row: shown only when BotFather has disabled new group additions
    if (!canGroups) {
      rows.push([{
        type: 'action',
        text: getTranslation(lang, 'btnGroupJoinDisabled'),
        action: 'noJoin',
        value: '',
        isDanger: true
      }]);
    }

    rows.push([groupsToggle]);
    rows.push([modeBtn('btnSecretary', 'secretary', canSecretary)]);
    rows.push([modeBtn('btnGuest', 'guest', canGuest)]);

    return rows;
  },
  handleAction: async (action, value, settings, ctx) => {
    const parts = value.split(':');
    const settingKey = parts[0];
    const expectedState = parts.length > 1 ? parts[1] : null;

    const freshRes = await callTelegram(ctx.token, 'getMe', {});
    const freshInfo = freshRes.ok ? freshRes.result : null;
    ctx.botInfo = freshInfo;

    // noJoin: user tapped the informational "Group additions disabled" button
    if (action === 'noJoin') {
      await callTelegram(ctx.token, 'sendMessage', {
        chat_id: ctx.message.chat.id,
        text: getMarkdown(ctx.lang, 'modeDisabledGroups'),
        parse_mode: 'MarkdownV2'
      });
      await callTelegram(ctx.token, 'answerCallbackQuery', { callback_query_id: ctx.callbackQueryId });
      return { handled: true };
    }

    const capAllowed =
      settingKey === 'secretary' ? freshInfo?.can_connect_to_business === true :
      settingKey === 'guest'     ? freshInfo?.supports_guest_queries === true :
      /* groups — always allowed */ true;

    const alertKey = settingKey === 'secretary' ? 'modeDisabledSecretary'
                   : settingKey === 'guest'     ? 'modeDisabledGuest'
                   : 'modeDisabledGroups';
    const outOfSyncText = getTranslation(ctx.lang, 'btnStateOutOfSync');

    // Reject if the button's intended boolean state doesn't match the server's current state
    if (expectedState) {
      const currentState = settings[settingKey] === true ? 'on' : (settings[settingKey] === 'leave' ? 'leave' : 'off');
      if (expectedState !== currentState) {
        await callTelegram(ctx.token, 'answerCallbackQuery', {
          callback_query_id: ctx.callbackQueryId,
          text: outOfSyncText,
          show_alert: false
        });
        return { refreshed: true };
      }
    }

    if (action === 'toggle') {
      if (capAllowed) {
        if (settingKey === 'groups') {
          if (settings.groups === true) settings.groups = false;
          else if (settings.groups === false || settings.groups === undefined) settings.groups = 'leave';
          else settings.groups = true;
        }
        else if (settingKey === 'secretary') settings.secretary = !settings.secretary;
        else if (settingKey === 'guest') settings.guest = !settings.guest;
        return { updated: true };
      } else {
        await callTelegram(ctx.token, 'answerCallbackQuery', {
          callback_query_id: ctx.callbackQueryId,
          text: outOfSyncText,
          show_alert: false
        });
        return { refreshed: true }; // Trigger re-render
      }
    }

    if (action === 'disabled') {
      if (capAllowed) {
        await callTelegram(ctx.token, 'answerCallbackQuery', {
          callback_query_id: ctx.callbackQueryId,
          text: outOfSyncText,
          show_alert: false
        });
        return { refreshed: true };
      } else {
        await callTelegram(ctx.token, 'sendMessage', {
          chat_id: ctx.message.chat.id,
          text: getMarkdown(ctx.lang, alertKey),
          parse_mode: 'MarkdownV2'
        });
        await callTelegram(ctx.token, 'answerCallbackQuery', { callback_query_id: ctx.callbackQueryId });
        return { handled: true };
      }
    }
  }
});

registerMenu('langbot', {
  getTitle: (settings, lang) => cleanTitle(lang, 'langbotTitle'),
  getValue: (settings, lang, ctx) => {
    const esc = escapeMarkdownV2;
    const lbAuto = settings.autodetect !== false;
    const lbCode = settings.langbot === 'auto' ? 'en' : (settings.langbot || 'en');
    const val = lbAuto ? (ctx.userLangCode ? `${getTranslation(lang, 'btnAuto')} (${ctx.userLangCode})` : getTranslation(lang, 'btnAuto')) : (TRANSCRIPTION_LANGUAGES[lbCode] || lbCode.toUpperCase());
    return `_${esc(val)}_`;
  },
  getButtons: (settings, lang, ctx) => {
    const isAuto = settings.autodetect !== false;
    const lb = settings.langbot === 'auto' ? 'en' : (settings.langbot || 'en');
    
    const autoLabel = getTranslation(lang, 'btnAuto');
    const autoText = ctx.userLangCode ? `${autoLabel} (${ctx.userLangCode})` : autoLabel;

    const rows = [
      [{ type: 'toggle', text: autoText, action: 'toggle', value: 'auto', isActive: isAuto }]
    ];

    const uiLangs = Object.keys(translations);
    for (let i = 0; i < uiLangs.length; i += 2) {
      const row = [];
      const code1 = uiLangs[i];
      const name1 = TRANSCRIPTION_LANGUAGES[code1] || code1.toUpperCase();
      row.push({ type: 'radio', text: name1, action: 'set', value: code1, activeValue: lb });

      if (i + 1 < uiLangs.length) {
        const code2 = uiLangs[i + 1];
        const name2 = TRANSCRIPTION_LANGUAGES[code2] || code2.toUpperCase();
        row.push({ type: 'radio', text: name2, action: 'set', value: code2, activeValue: lb });
      }
      rows.push(row);
    }
    return rows;
  },
  getText: (settings, lang) => getMarkdown(lang, 'langbotTitle').split('\n').slice(1).join('\n'),
  handleAction: async (action, value, settings, _ctx) => {
    if (action === 'toggle' && value === 'auto') {
      settings.autodetect = settings.autodetect === false;
      if (settings.langbot === 'auto') settings.langbot = 'en';
      return { updated: true };
    }
    if (action === 'set') {
      settings.langbot = value;
      return { updated: true };
    }
  },
  onUpdated: async (settings, ctx) => {
    const displayLang = getUserLang(settings, ctx.userLangCode);
    await setupBotCommands(ctx.token, ctx.message.chat.id, true, displayLang).catch(console.error);
    ctx.lang = displayLang;
  }
});

registerMenu('lang', {
  getTitle: (settings, lang) => cleanTitle(lang, 'langTitle'),
  getValue: (settings, lang) => {
    const esc = escapeMarkdownV2;
    const val = settings.lang === 'auto' ? getTranslation(lang, 'langAuto') : (TRANSCRIPTION_LANGUAGES[settings.lang] || settings.lang.toUpperCase());
    return `_${esc(val)}_`;
  },
  getText: (settings, lang) => {
    const val = settings.lang === 'auto' ? getTranslation(lang, 'langAuto') : (TRANSCRIPTION_LANGUAGES[settings.lang] || settings.lang.toUpperCase());
    return getMarkdown(lang, 'langTitle', { val }).split('\n').slice(1).join('\n');
  },
  getButtons: (settings, lang) => {
    const active = settings.lang;
    const rows = [
      [{ type: 'toggle', text: getTranslation(lang, 'langAuto'), action: 'set', value: 'auto', isActive: active === 'auto' }]
    ];

    const langKeys = Object.keys(TRANSCRIPTION_LANGUAGES);
    for (let i = 0; i < langKeys.length; i += 2) {
      const row = [];
      const code1 = langKeys[i];
      const name1 = TRANSCRIPTION_LANGUAGES[code1];
      row.push({ type: 'radio', text: name1, action: 'set', value: code1, activeValue: active });

      if (i + 1 < langKeys.length) {
        const code2 = langKeys[i + 1];
        const name2 = TRANSCRIPTION_LANGUAGES[code2];
        row.push({ type: 'radio', text: name2, action: 'set', value: code2, activeValue: active });
      }
      rows.push(row);
    }

    const isOtherActive = active !== 'auto' && !Object.prototype.hasOwnProperty.call(TRANSCRIPTION_LANGUAGES, active);
    let otherLabel = getTranslation(lang, 'btnOtherLang');
    if (isOtherActive) {
      otherLabel = otherLabel.replace('…', ` (${active})`);
    }
    const currentLangVal = (settings.lang && settings.lang !== 'auto') ? settings.lang : '';
    const otherBtn = {
      type: 'action',
      text: otherLabel,
      isActive: isOtherActive,
      switch_inline_query_current_chat: currentLangVal ? `/lang ${currentLangVal}` : '/lang '
    };

    // If odd number of languages, last one sits alone — combine it with Other... on the same row
    if (langKeys.length % 2 !== 0) {
      rows[rows.length - 1].push(otherBtn);
    } else {
      rows.push([otherBtn]);
    }

    return rows;
  },
  handleAction: async (action, value, settings) => {
    if (action === 'set') {
      settings.lang = value;
      return { updated: true };
    }
  }
});

registerMenu('model', {
  getTitle: (settings, lang) => cleanTitle(lang, 'modelTitle'),
  getValue: (settings, lang, ctx) => {
    const models = ctx?.availableModels || DEFAULT_MODELS;
    return settings.model || models[0];
  },
  getText: (settings, lang, ctx) => {
    const models = ctx?.availableModels || DEFAULT_MODELS;
    const active = settings.model || models[0];
    return getMarkdown(lang, 'modelTitle', { val: active }).split('\n').slice(1).join('\n');
  },
  getButtons: (settings, lang, ctx) => {
    const models = ctx?.availableModels || DEFAULT_MODELS;
    const active = settings.model || models[0];
    return models.map(model => [
      { type: 'radio', text: model, action: 'set', value: model, activeValue: active }
    ]);
  },
  handleAction: async (action, value, settings) => {
    if (action === 'set') {
      settings.model = value;
      return { updated: true };
    }
  }
});

registerMenu('notify', {
  getTitle: (settings, lang) => cleanTitle(lang, 'notifyTitle'),
  getValue: (settings, lang, ctx) => {
    const esc = escapeMarkdownV2;
    const canGroups    = ctx?.botInfo?.can_join_groups !== false;
    const canSecretary = ctx?.botInfo?.can_connect_to_business === true;

    const showGroupAdd = canGroups    && settings.groups === true;
    const showSecConn  = canSecretary && !!settings.secretary;

    const labelAdd  = esc(getTranslation(lang, 'btnGroups'));
    const labelConn = esc(getTranslation(lang, 'btnSecretary'));
    const labelErr  = esc(getTranslation(lang, 'btnErrorsShort'));

    const addStr  = (settings.notify_add && showGroupAdd) ? labelAdd : `~${labelAdd}~`;
    const connStr = (settings.notify_conn && showSecConn) ? labelConn : `~${labelConn}~`;
    const errStr  = settings.notify_err ? labelErr : `~${labelErr}~`;

    return `_${[addStr, connStr, errStr].join(', ')}_`;
  },
  getText: (settings, lang, ctx) => {
    const canGroups    = ctx.botInfo?.can_join_groups !== false;
    const canSecretary = ctx.botInfo?.can_connect_to_business === true;
    const showGroupAdd = canGroups    && settings.groups === true;
    const showSecConn  = canSecretary && !!settings.secretary;
    const hasHidden    = !showGroupAdd || !showSecConn;
    const baseText = getMarkdown(lang, 'notifyTitle').split('\n').slice(1).join('\n').trimStart();
    const footer = hasHidden ? ('\n\n' + getMarkdown(lang, 'notifyFooterHidden')) : '';
    return baseText + footer;
  },
  prepare: async (settings, lang, ctx) => {
    const freshRes = await callTelegram(ctx.token, 'getMe', {});
    ctx.botInfo = freshRes.ok ? freshRes.result : null;
  },
  getButtons: (settings, lang, ctx) => {
    const canGroups    = ctx.botInfo?.can_join_groups !== false;
    const canSecretary = ctx.botInfo?.can_connect_to_business === true;

    const showGroupAdd = canGroups    && settings.groups === true;
    const showSecConn  = canSecretary && !!settings.secretary;

    const rows = [];
    if (showGroupAdd) {
      rows.push([{ type: 'toggle', text: getTranslation(lang, 'btnGroups'), action: 'toggle', value: 'add', isActive: settings.notify_add }]);
    }
    if (showSecConn) {
      rows.push([{ type: 'toggle', text: getTranslation(lang, 'btnSecretaryAdditions'), action: 'toggle', value: 'conn', isActive: settings.notify_conn }]);
    }
    rows.push([{ type: 'toggle', text: getTranslation(lang, 'btnCriticalErrors'), action: 'toggle', value: 'err', isActive: settings.notify_err }]);
    
    return rows;
  },
  handleAction: async (action, value, settings) => {
    if (action === 'toggle') {
      if (value === 'add') settings.notify_add = !settings.notify_add;
      else if (value === 'conn') settings.notify_conn = !settings.notify_conn;
      else if (value === 'err') settings.notify_err = !settings.notify_err;
      return { updated: true };
    }
  }
});

registerMenu('verbose', {
  getTitle: (settings, lang) => cleanTitle(lang, 'verboseTitle'),
  getValue: (settings) => {
    return settings.verbose ? '✅' : '❌';
  },
  getText: (settings, lang) => getMarkdown(lang, 'verboseTitle').split('\n').slice(1).join('\n'),
  getButtons: (settings, lang) => [
    [
      { type: 'radio', text: getTranslation(lang, 'btnOn'), action: 'set', value: 'true', activeValue: String(settings.verbose) },
      { type: 'radio', text: getTranslation(lang, 'btnOff'), action: 'set', value: 'false', activeValue: String(settings.verbose) }
    ]
  ],
  handleAction: async (action, value, settings) => {
    if (action === 'set') {
      settings.verbose = (value === 'true');
      return { updated: true };
    }
  }
});

registerMenu('prompt', {
  getTitle: (settings, lang) => cleanTitle(lang, 'promptTitle'),
  getValue: (settings, lang, ctx) => {
    const esc = escapeMarkdownV2;
    if (settings.prompt === undefined) {
      const val = ctx?.config?.whisperPrompt ? `"${ctx.config.whisperPrompt}"` : '—';
      return `_${esc(val)}_`;
    }
    const val = settings.prompt === '' ? '—' : `"${settings.prompt}"`;
    return `_${esc(val)}_`;
  },
  getText: (settings, lang, ctx) => {
    let currentPromptText;
    if (settings.prompt === undefined) {
      currentPromptText = ctx?.config?.whisperPrompt
        ? getTranslation(lang, 'promptDefault')
        : getTranslation(lang, 'promptEmpty');
    } else if (settings.prompt === '') {
      currentPromptText = getTranslation(lang, 'promptEmpty');
    } else {
      currentPromptText = `"${settings.prompt}"`;
    }
    return getMarkdown(lang, 'promptTitle', { val: currentPromptText }).split('\n').slice(1).join('\n');
  },
  getButtons: (settings, lang, ctx) => {
    const isClearActive = settings.prompt === '';
    const isCustomActive = settings.prompt !== undefined && settings.prompt !== '';
    const isDefaultActive = settings.prompt === undefined;

    const clearBtn = {
      type: 'action',
      text: getTranslation(lang, 'btnClearPrompt'),
      isActive: isClearActive,
      action: 'set',
      value: 'empty'
    };

    const currentPromptVal = (settings.prompt !== undefined && settings.prompt !== '') ? settings.prompt : '';
    const customBtn = {
      type: 'action',
      text: getTranslation(lang, 'btnOtherPrompt'),
      isActive: isCustomActive,
      switch_inline_query_current_chat: currentPromptVal ? `/prompt ${currentPromptVal}` : '/prompt '
    };

    const firstRow = [clearBtn, customBtn];

    if (ctx?.config?.whisperPrompt) {
      return [
        firstRow,
        [{
          type: 'action',
          text: getTranslation(lang, 'btnDefaultPrompt'),
          isActive: isDefaultActive,
          action: 'set',
          value: 'default'
        }]
      ];
    }
    return [firstRow];
  },
  handleAction: async (action, value, settings) => {
    if (action === 'set') {
      if (value === 'empty') settings.prompt = '';
      else if (value === 'default') settings.prompt = undefined;
      return { updated: true };
    }
  }
});

registerMenu('webhook', {
  getTitle: (settings, lang) => cleanTitle(lang, 'webhookTitle'),
  getValue: (settings, lang, ctx) => ctx.webhookUrl || '—',
  prepare: async (settings, lang, ctx) => {
    const res = await callTelegram(ctx.token, 'getWebhookInfo', {});
    ctx.webhookUrl = res.ok ? (res.result?.url || '—') : '—';
  },
  getText: (settings, lang, ctx) => {
    const url = ctx.webhookUrl || '—';
    return getMarkdown(lang, 'webhookMenuText', { url });
  },
  getButtons: (settings, lang) => [[
    { type: 'action', text: getTranslation(lang, 'btnChangeWebhook'), switch_inline_query_current_chat: '/webhook ' }
  ]],
  handleAction: async () => ({ handled: true })
});
