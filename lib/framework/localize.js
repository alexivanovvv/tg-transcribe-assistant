// lib/framework/localize.js
// Universal dictionary translation and formatting engine

import { escapeMarkdownV2, escapeMarkdownV2Code, escapeMarkdownV2Link, toMarkdownV2 } from './markdown.js';

let translations = {};

export function configureLocalization(data) {
  translations = data;
}

export function hasTranslation(langCode) {
  if (!langCode) return false;
  const cleanLang = langCode.toLowerCase().split('-')[0];
  return Object.prototype.hasOwnProperty.call(translations, cleanLang);
}

export function getUserLang(settings, userLangCode) {
  const autodetect = settings.autodetect !== false;
  const fallback = (settings.langbot && settings.langbot !== 'auto') ? settings.langbot : 'en';
  if (autodetect && userLangCode && hasTranslation(userLangCode)) {
    return userLangCode;
  }
  return fallback;
}

export function getTranslation(langCode, key, params = {}) {
  let lang = 'en';
  if (langCode) {
    const cleanLang = langCode.toLowerCase().split('-')[0];
    if (Object.prototype.hasOwnProperty.call(translations, cleanLang)) {
      lang = cleanLang;
    }
  }
  
  let text = translations[lang]?.[key] || translations['en']?.[key] || '';
  
  // Find and replace all placeholders of the format {name} or {name:modifier}
  text = text.replace(/\{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?\}/g, (match, paramName, modifier, offset) => {
    if (params[paramName] === undefined) {
      return match;
    }
    const valStr = String(params[paramName]);
    
    // Explicit modifiers
    if (modifier === 'raw') {
      return valStr;
    }
    if (modifier === 'code') {
      return '`' + escapeMarkdownV2Code(valStr) + '`';
    }
    if (modifier === 'codeblock') {
      return '```\n' + escapeMarkdownV2Code(valStr) + '\n```';
    }
    
    // Legacy context-aware logic based on prefix in the original template
    const prevPart = text.substring(0, offset);
    
    const backtickCount = (prevPart.match(/`/g) || []).length;
    const isInsideCode = (backtickCount % 2 !== 0);
    
    const preCount = (prevPart.match(/```/g) || []).length;
    const isInsidePre = (preCount % 2 !== 0);
    
    const isOpenParen = prevPart.endsWith('](');
    
    if (paramName.startsWith('raw')) {
      return valStr;
    } else if (isInsideCode || isInsidePre) {
      return escapeMarkdownV2Code(valStr);
    } else if (isOpenParen) {
      return escapeMarkdownV2Link(valStr);
    } else {
      return escapeMarkdownV2(valStr);
    }
  });
  
  return text;
}

export function getMarkdown(langCode, key, params = {}) {
  const rawText = getTranslation(langCode, key, params);
  return toMarkdownV2(rawText);
}
