// lib/framework/router.js
// Generic Telegram Command Router and registry

import { toMarkdownV2, stripMarkdown } from './markdown.js';
import { callTelegram, sha256, getHeader } from './utils.js';

export const COMMAND_REGISTRY = [];

/**
 * Wrap a README URL or path into a standard document-sending handler.
 */
function makeReadmeHandler(fileUrlOrPath) {
  return async (message, ctx) => {
    let content = null;
    const cleanUrl = fileUrlOrPath.startsWith('http') ? fileUrlOrPath : '';

    // 1. Try fetching from URL if applicable
    if (cleanUrl) {
      try {
        let rawUrl = fileUrlOrPath;
        if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
          rawUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com');
          rawUrl = rawUrl.replace('/blob/main/', '/main/')
                         .replace('/blob/master/', '/master/');
          if (!rawUrl.endsWith('.md')) {
            rawUrl = rawUrl.replace(/\/$/, '') + '/main/README.md';
          }
        }
        const res = await fetch(rawUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          content = await res.text();
        }
      } catch (e) {
        console.error(`Failed to fetch readme from URL ${fileUrlOrPath}:`, e);
      }
    } else {
      // Try local filesystem read
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const p = path.resolve(fileUrlOrPath);
        if (fs.existsSync(p)) {
          content = fs.readFileSync(p, 'utf-8');
        }
      } catch (e) {
        console.error(`Failed to read local readme file from ${fileUrlOrPath}:`, e);
      }
    }

    // 2. Final fallback to local README.md in current directory
    if (!content) {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
        const p = path.join(cwd, 'README.md');
        if (fs.existsSync(p)) content = fs.readFileSync(p, 'utf-8');
      } catch { /* local README.md not found */ }
    }

    // 3. Send the document
    try {
      if (!content) {
        throw new Error('README content is empty or could not be loaded');
      }

      const blob = new Blob([content], { type: 'text/markdown' });
      const formData = new FormData();
      formData.append('chat_id', ctx.chatId);
      formData.append('document', blob, 'README.md');
      if (cleanUrl) {
        formData.append('caption', cleanUrl);
      }

      const callRes = await fetch(`https://api.telegram.org/bot${ctx.token}/sendDocument`, {
        method: 'POST',
        body: formData
      });
      const data = await callRes.json();
      if (!data.ok) {
        throw new Error(`Telegram API sendDocument failed: ${data.description}`);
      }
    } catch (e) {
      console.error('Failed to send README as document:', e);

      // Escape MarkdownV2 helper
      const escapeMd = (str) => (str || '')
        .replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

      const fallbackText = cleanUrl
        ? `⚠️ *Failed to send README\\.md attachment*:\n${escapeMd(e.message || String(e))}\n\nYou can read the README directly on GitHub:\n${escapeMd(cleanUrl)}`
        : `⚠️ *Failed to send README\\.md attachment*:\n${escapeMd(e.message || String(e))}`;

      const fallbackRes = await callTelegram(ctx.token, 'sendMessage', {
        chat_id: ctx.chatId,
        text: fallbackText,
        parse_mode: 'MarkdownV2'
      });
      if (!fallbackRes.ok) {
        throw new Error(`Failed to send readme fallback message: ${fallbackRes.description || 'Unknown error'}`, { cause: e });
      }
    }
    return true;
  };
}

/**
 * Register a bot command handler.
 */
export function registerCommand(command, handler, options = {}) {
  const priority = options.priority !== undefined ? options.priority : 100;
  const finalHandler = typeof handler === 'string' ? makeReadmeHandler(handler) : handler;

  COMMAND_REGISTRY.push({
    command: command.toLowerCase(),
    handler: finalHandler,
    condition: options.condition || (() => true),
    isAdmin: !!options.isAdmin,
    priority,
    descriptionKey: options.descriptionKey || null,
    hidden: !!options.hidden,
    requiresReply: !!options.requiresReply
  });
  // Sort by priority descending (higher priority first)
  COMMAND_REGISTRY.sort((a, b) => b.priority - a.priority);
}

export const HTTP_ROUTES = {};

export function registerHttpRoute(path, handler) {
  HTTP_ROUTES[path] = handler;
}

export async function dispatchHttpRoute(requestInfo, config, ctx) {
  const pathname = requestInfo.urlPath || '';
  const handler = HTTP_ROUTES[pathname] || (requestInfo.method === 'POST' && pathname === '/' ? HTTP_ROUTES['/api/webhook'] : null);
  if (handler) {
    return await handler(requestInfo, config, ctx);
  }
  return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not Found' };
}

/**
 * Generate standard /help text dynamically from registered COMMAND_REGISTRY.
 */
export function generateHelpText(isMsgFromOwner, lang, version, greetingText, settingsTitle, getTranslation, options = {}) {
  const isUnsolicited = !!options.isUnsolicited;

  const userCmds = COMMAND_REGISTRY
    .filter(cmd => !cmd.isAdmin && !cmd.hidden)
    .sort((a, b) => a.command.localeCompare(b.command));

  let cmdsList = '';
  for (const cmd of userCmds) {
    const desc = getTranslation(lang, cmd.descriptionKey) || cmd.command;
    cmdsList += `\n/${cmd.command} \\- ${toMarkdownV2(desc)}`;
  }

  if (isMsgFromOwner) {
    cmdsList += `\n\n${settingsTitle}`;
    
    const adminCmds = COMMAND_REGISTRY
      .filter(cmd => cmd.isAdmin && !cmd.hidden)
      .sort((a, b) => a.command.localeCompare(b.command));
      
    for (const cmd of adminCmds) {
      const desc = getTranslation(lang, cmd.descriptionKey) || cmd.command;
      cmdsList += `\n/${cmd.command} \\- ${toMarkdownV2(desc)}`;
    }
  }

  cmdsList = cmdsList.trim();
  let responseText = greetingText + '\n\n';

  if (isUnsolicited) {
    const lines = cmdsList.split('\n');
    responseText += '**>' + lines.join('\n>') + '||';
  } else {
    responseText += cmdsList;
    if (version) {
      const versionLabel = toMarkdownV2(getTranslation(lang, 'botVersion', { val: version })) || `⚙️ Version: \`${toMarkdownV2(version)}\``;
      responseText += `\n\n${versionLabel}`;
    }
  }

  return responseText;
}

/**
 * Synchronize public and admin scoped commands with Telegram API.
 */
export async function syncBotCommands(token, ownerChatId, langCode, getTranslation, _options = {}) {
  const cleanLang = langCode ? langCode.toLowerCase().split('-')[0] : 'en';

  // 1. Register public commands globally
  const publicCommands = COMMAND_REGISTRY
    .filter(cmd => !cmd.isAdmin && !cmd.hidden)
    .map(cmd => {
      const rawDesc = getTranslation(cleanLang, cmd.descriptionKey) || cmd.command;
      return {
        command: cmd.command,
        description: stripMarkdown(rawDesc)
      };
    })
    .sort((a, b) => a.command.localeCompare(b.command));

  const payloadPublic = { commands: publicCommands };
  if (langCode) {
    payloadPublic.language_code = langCode;
  }
  await callTelegram(token, 'setMyCommands', payloadPublic);

  // 2. Register full command suite for the owner chat specifically if owner exists
  if (ownerChatId) {
    const adminCommands = COMMAND_REGISTRY
      .filter(cmd => !cmd.hidden)
      .map(cmd => {
        const rawDesc = getTranslation(cleanLang, cmd.descriptionKey) || cmd.command;
        return {
          command: cmd.command,
          description: stripMarkdown(rawDesc)
        };
      })
      .sort((a, b) => a.command.localeCompare(b.command));

    const payloadAdmin = {
      commands: adminCommands,
      scope: {
        type: 'chat',
        chat_id: Number(ownerChatId)
      }
    };
    if (langCode) {
      payloadAdmin.language_code = langCode;
    }
    await callTelegram(token, 'setMyCommands', payloadAdmin);
  }
}

export async function handleHealthCheck(requestInfo = {}, config = {}, customChecks = async () => ({})) {
  let runtime;
  if (typeof Deno !== 'undefined') {
    runtime = (Deno.env && Deno.env.get('VAL_TOWN_API_KEY')) ? 'val-town' : 'deno-deploy';
  } else if (typeof process !== 'undefined' && process.env) {
    runtime = process.env.NETLIFY ? 'netlify' : 'vercel/node';
  } else {
    runtime = 'cloudflare-workers';
  }

  let cryptoOk = false;
  let cryptoError = null;
  try {
    const hash = await sha256("test");
    cryptoOk = (hash === "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  } catch (e) {
    cryptoError = e.message || String(e);
  }

  const token = config.telegramBotToken;
  const requestToken = requestInfo.query?.token;
  const isAuthorized = requestToken && requestToken === token;

  let telegramOk = false;
  let botDetails = null;
  let webhookDetails = null;
  let telegramError = null;

  if (isAuthorized && token) {
    try {
      const [meRes, webhookRes] = await Promise.all([
        callTelegram(token, 'getMe', {}),
        callTelegram(token, 'getWebhookInfo', {})
      ]);
      
      if (meRes.ok) {
        botDetails = {
          id: meRes.result.id,
          username: meRes.result.username,
          first_name: meRes.result.first_name
        };
      }
      
      if (webhookRes.ok) {
        webhookDetails = {
          url: webhookRes.result.url,
          pending_update_count: webhookRes.result.pending_update_count,
          allowed_updates: webhookRes.result.allowed_updates
        };
        
        const proto = getHeader(requestInfo.headers, 'x-forwarded-proto') || 'https';
        const host = getHeader(requestInfo.headers, 'host');
        const currentBaseUrl = `${proto}://${host}`;
        
        if (webhookDetails.url && webhookDetails.url.startsWith(currentBaseUrl)) {
          telegramOk = meRes.ok;
        } else {
          telegramError = `Webhook URL mismatch. Expected base ${currentBaseUrl}, got ${webhookDetails.url}`;
        }
      } else {
        telegramError = webhookRes.description || 'Failed to get webhook info';
      }
    } catch (e) {
      telegramError = e.message || String(e);
    }
  }

  const additional = await customChecks(requestInfo, config);
  const additionalOk = additional.ok !== false;

  const configChecks = {
    telegramBotToken: !!config.telegramBotToken,
    ...(additional.config_checks || {})
  };

  const tests = {
    crypto: { ok: cryptoOk, error: cryptoError },
    telegram_connectivity: {
      ok: isAuthorized ? telegramOk : null,
      bot: botDetails,
      webhook: webhookDetails,
      status: isAuthorized ? "verified" : "unverified",
      error: telegramError
    },
    ...(additional.tests || {})
  };

  const isHealthy = cryptoOk && additionalOk && (!token || (isAuthorized ? telegramOk : true));

  const responseBody = {
    status: isHealthy ? 'healthy' : 'degraded',
    version: config.version || '0.0.0',
    runtime,
    config_checks: configChecks,
    tests
  };

  return {
    status: responseBody.status === 'healthy' ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
    body: responseBody
  };
}

