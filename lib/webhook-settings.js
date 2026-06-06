import { sha256, callTelegram } from './framework/utils.js';
import { parseWebhookQuery, buildWebhookUrl, buildAllowedUpdates } from './framework/settings.js';
import { truncateTokensFromLeft, MAX_PROMPT_TOKENS } from './utils.js';

/**
 * Parse current bot settings from Telegram's WebhookInfo.
 * @param {Object} webhookInfo - Response from getWebhookInfo
 * @returns {Object} Parsed configuration
 */
export function parseWebhookConfig(webhookInfo) {
  const query = parseWebhookQuery(webhookInfo);

  const allowedUpdates = webhookInfo?.allowed_updates || [];

  return {
    groups: query.groups === 'off' ? false : (query.groups === 'leave' ? 'leave' : true), // Defaults to true/on
    guest: allowedUpdates.includes('guest_message'),
    secretary: allowedUpdates.includes('business_message'),
    lang: query.lang || 'auto',
    langbot: query.langbot || 'en',
    autodetect: query.autodetect !== 'off', // Defaults to true
    model: query.model || '',
    notify_add: query.notify_add !== 'off', // Defaults to true/on
    notify_conn: query.notify_conn !== 'off', // Defaults to true/on
    notify_err: query.notify_err !== 'off', // Defaults to true/on
    verbose: query.verbose === 'on', // Defaults to false/off
    prompt: query.prompt !== undefined ? query.prompt : undefined,
    owner: query.owner || ''
  };
}

/**
 * Build Webhook payload for Telegram's setWebhook method.
 * @param {string} baseUrl - Base URL of the deployment (e.g. https://domain.com)
 * @param {string} token - Telegram Bot Token
 * @param {Object} currentConfig - Config object containing current state
 * @param {string} secretToken - SHA-256 hash of the bot token
 * @returns {Object} Payload for setWebhook
 */
export function buildWebhookSetup(baseUrl, token, currentConfig, secretToken) {
  const query = {};
  
  if (currentConfig.groups === false) {
    query.groups = 'off';
  } else if (currentConfig.groups === 'leave') {
    query.groups = 'leave';
  }
  if (currentConfig.lang && currentConfig.lang !== 'auto') {
    query.lang = currentConfig.lang;
  }
  if (currentConfig.langbot && currentConfig.langbot !== 'en') {
    query.langbot = currentConfig.langbot;
  }
  if (!currentConfig.autodetect) {
    query.autodetect = 'off';
  }
  if (currentConfig.model) {
    query.model = currentConfig.model;
  }
  if (!currentConfig.notify_add) {
    query.notify_add = 'off';
  }
  if (!currentConfig.notify_conn) {
    query.notify_conn = 'off';
  }
  if (!currentConfig.notify_err) {
    query.notify_err = 'off';
  }
  if (currentConfig.verbose) {
    query.verbose = 'on';
  }
  if (currentConfig.prompt !== undefined) {
    // Truncate from the left to fit within MAX_PROMPT_TOKENS for safety inside the webhook URL.
    // Whisper only uses the last 224 tokens of the prompt: https://developers.openai.com/api/docs/guides/speech-to-text
    const safePrompt = truncateTokensFromLeft(currentConfig.prompt, MAX_PROMPT_TOKENS);
    query.prompt = safePrompt;
  }
  if (currentConfig.owner) {
    query.owner = currentConfig.owner;
  }

  const webhookUrl = buildWebhookUrl(baseUrl, '/api/webhook', query);
  const allowedUpdates = buildAllowedUpdates(
    ['message', 'my_chat_member', 'callback_query'],
    [
      { enabled: currentConfig.guest, updates: ['guest_message'] },
      { enabled: currentConfig.secretary, updates: ['business_connection', 'business_message', 'edited_business_message'] }
    ]
  );

  return {
    url: webhookUrl,
    allowed_updates: allowedUpdates,
    secret_token: secretToken
  };
}

/**
 * Retrieve current webhook info and parse its configuration.
 */
export async function getWebhookConfig(token) {
  const res = await callTelegram(token, 'getWebhookInfo', {});
  if (res.ok) {
    return parseWebhookConfig(res.result);
  }
  return parseWebhookConfig({});
}

/**
 * Update the webhook with new settings.
 */
export async function updateWebhookConfig(token, baseUrl, newConfig) {
  const secretToken = await sha256(token);
  const webhookSetup = buildWebhookSetup(baseUrl, token, newConfig, secretToken);
  return await callTelegram(token, 'setWebhook', webhookSetup);
}
