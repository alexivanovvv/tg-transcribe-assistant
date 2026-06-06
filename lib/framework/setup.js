// lib/framework/setup.js
// Generic Telegram webhook setup handler factory

import { getHeader, sha256, callTelegram } from './utils.js';

function mergeSettings(defaultSettings, currentSettings) {
  const merged = { ...defaultSettings };
  Object.keys(currentSettings || {}).forEach((key) => {
    const val = currentSettings[key];
    if (val !== undefined && val !== '') {
      merged[key] = val;
    }
  });
  return merged;
}

export function makeWebhookSetupHandler(options = {}) {
  const {
    parseWebhookConfig = () => ({}),
    buildWebhookSetup,
    getDefaultSettings = () => ({}),
    onAfterSetup = async () => {}
  } = options;

  if (typeof buildWebhookSetup !== 'function') {
    throw new Error('makeWebhookSetupHandler requires buildWebhookSetup function');
  }

  return async function handleSetup(requestInfo, config) {
    const token = config.telegramBotToken;

    if (!token) {
      console.error('telegramBotToken is not defined in config');
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Bot token not configured on server' }
      };
    }

    const requestToken = requestInfo.query?.token || requestInfo.body?.token;
    if (!requestToken || requestToken !== token) {
      return {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Forbidden: Invalid or missing token parameter' }
      };
    }

    try {
      const proto = getHeader(requestInfo.headers, 'x-forwarded-proto') || 'https';
      const host = getHeader(requestInfo.headers, 'host');
      const baseUrl = config.webhookBaseUrl || `${proto}://${host}`;

      let currentSettings = {};
      try {
        const infoData = await callTelegram(token, 'getWebhookInfo', {});
        if (infoData.ok && infoData.result?.url) {
          currentSettings = parseWebhookConfig(infoData.result);
        }
      } catch (e) {
        console.warn('Failed to retrieve current webhook info:', e);
      }

      const action = requestInfo.query?.action || requestInfo.body?.action;
      if (action === 'reset_owner') {
        currentSettings.owner = '';
        const resetSecret = await sha256(token);
        const resetWebhookSetup = buildWebhookSetup(baseUrl, token, currentSettings, resetSecret);
        const resetRes = await callTelegram(token, 'setWebhook', resetWebhookSetup);
        if (resetRes.ok) {
          return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: { ok: true, message: 'Owner Chat ID has been successfully reset.' }
          };
        }
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: { ok: false, error: 'Telegram API error: ' + (resetRes.error || JSON.stringify(resetRes)) }
        };
      }

      const defaultSettings = mergeSettings(getDefaultSettings(), currentSettings);
      const secretToken = await sha256(token);
      const webhookSetup = buildWebhookSetup(baseUrl, token, defaultSettings, secretToken);
      console.log(`Registering webhook: ${webhookSetup.url}`);

      const data = await callTelegram(token, 'setWebhook', webhookSetup);
      if (!data.ok) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          body: {
            ok: false,
            error: 'Telegram API returned an error',
            telegram_response: data
          }
        };
      }

      try {
        await onAfterSetup({ token, config, defaultSettings, currentSettings, webhookSetup });
      } catch (afterError) {
        console.error('Post-setup hook failed:', afterError);
      }

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          ok: true,
          message: 'Webhook registered successfully',
          webhook_url: webhookSetup.url,
          telegram_response: data
        }
      };
    } catch (error) {
      console.error('Error registering webhook:', error);
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: {
          ok: false,
          error: `Internal setup exception: ${error.message || error}`
        }
      };
    }
  };
}
