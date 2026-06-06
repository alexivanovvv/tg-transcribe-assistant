# Serverless Telegram Bot Framework 🚀🤖

A lightweight, database-less, cross-platform framework for building Telegram bots on serverless runtimes.
It is designed to work seamlessly on **Vercel Functions, Netlify Functions, Cloudflare Workers, Deno Deploy, and Val Town**.

---

## 📌 Core Features

1. **Stateless Configuration**: No database required.
   Botstate, owner settings, and preferences are serialized directly into the Telegram webhook URL query parameters.
2. **Unified Platform Adapters**: Write once, deploy anywhere.
   Normalizes HTTP request/response payloads across Node.js (Vercel, Netlify) and Web standard runtimes (Cloudflare Workers, Deno, Val Town).
3. **Advanced Command Router**:
   Register text commands with priorities, role-based checks (owner vs. public), and custom condition gates.
4. **Interactive Keyboard Menu Engine**:
   Easily build nested settings menus with inline keyboards, state navigation, and automatic callback-query processing.
5. **Localization Engine**:
   Safe templating, placeholder interpolation, and language auto-detection from Telegram update headers.
6. **Robustness & Rate-Limiting**: 
   * Automatic **FIFO deduplication cache** for Telegram `update_id` retries.
   * Smart **429 Too Many Requests retry-and-bypass policies**.
   * Network timeout boundaries on all external fetches.
7. **Interactive Dashboard**:
   A beautiful, parameterized web configuration panel that checks bot configuration sanity,
   updates webhook parameters, and manages bot owner resets.
8. **Dependency-Injection Boundaries**:
   Framework modules accept bot-specific settings, localization, and profile dependencies through
   explicit options instead of importing application modules.

---

## 🏗️ Architecture & Serverless Compensations

Serverless hosting environments impose strict limits (cold starts, execution timeouts, ephemeral filesystems).
This framework employs specific strategies to address these limitations:

### 1. Database-less State (Stateless Webhook parameters)
Instead of storing configuration state (e.g., target language, features active, transcription model) in a database,
the framework serializes this state directly into the Telegram Webhook URL:
```
https://your-bot.example.com/api/webhook?groups=on&langbot=auto&model=whisper-large-v3&owner=12345
```
When an update arrives, the router deserializes the parameters, making them instantly available to handlers.

### 2. Ephemeral Deduplication Cache
Telegram retries sending updates if the server doesn't respond quickly.
In serverless instances, memory resets on cold starts, but warm instances preserve memory.
The framework maintains a lightweight in-memory FIFO set (`processedUpdates`) to filter out rapid duplicate `update_id` payloads.

### 3. Background Processing & `waitUntil`
Free-tier serverless environments enforce strict execution timeouts (often 10s).
If bot tasks (such as calling transcription APIs or downloading files) exceed this limit, the platform kills the function.

* **Immediate Acknowledgment**: The adapter returns `200 OK` to Telegram immediately to prevent webhook retries.
* **Background Tasks**: Where supported (Cloudflare Workers, Netlify, Vercel Edge),
  it uses `ctx.waitUntil(promise)` to instruct the runtime to keep the container active while the task runs in the background.
* **Synchronous Fallback**: For environments where background processing is suspended immediately after returning the response
  (like standard Vercel Node.js Serverless Containers), the framework falls back to awaiting the task before responding.

### 4. Rate-Limit Handling (429), Abort Timers & Markdown Fallbacks
* **429 Protection**: The built-in HTTP client (`callTelegram`) checks for `429 Too Many Requests`.
  If the suggested `retry_after` is $\le 5$ seconds, it waits and retries.
  Otherwise, it skips the request and fires an alert notification to the bot owner to bypass blocking of the serverless execution loop.
* **Abort Signals**: Enforces network timeout thresholds (e.g. 10s for Telegram API, 30s for asset downloads) to prevent execution hanging.
* **MarkdownV2 Fallback**: If a request using `parse_mode: 'MarkdownV2'` fails with a Markdown parsing error (e.g. `can't parse entities`), the client automatically strips the `parse_mode` parameter and retries the request as plain text, ensuring the message is always delivered.

### 5. Dynamic Version Propagation
The framework supports propagating the version dynamically from `package.json` to diagnostic health endpoints across different runtime environments:
* **Node.js**: Statically uses `require` to read and expose version string.
* **Cloudflare Workers (Wrangler compile-time)**: Statically imports `package.json` at build time.
* **Deno / Val Town (runtime try-import)**: Dynamically resolves `package.json` using a `try/catch` block with standard import attributes:
  ```javascript
  try {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    botVersion = pkg.default?.version || botVersion;
  } catch (e) {}
  ```

---

## 🛠️ Framework API Reference

### Framework Boundary

`lib/framework/` contains reusable Telegram and serverless mechanisms. It must not import bot
application modules such as `lib/localize.js`, `lib/webhook-settings.js`, `lib/commands.js`, or
`lib/menus.js`. The bot layer owns its configuration schema, translation dictionary, feature
settings, and business rules; it supplies those dependencies through factory options or
configuration functions.

This separation allows a different Telegram bot to reuse the framework without inheriting
Transcribot's Whisper-specific settings or localized copy.

### 1. HTTP Router & Entry Point
The router matches incoming HTTP endpoints (like `/api/webhook` or `/`) to registered handlers.

```javascript
import { registerHttpRoute, dispatchHttpRoute } from './framework/router.js';

// Register routes
registerHttpRoute('/api/webhook', handleWebhook);
registerHttpRoute('/api/health', handleHealthCheck);
```

To bind this router to a serverless platform, register a **Config Builder** and import the platform adapters in your entrypoints:

```javascript
// Register config parser
import { configureConfigBuilder } from './framework/adapters.js';
import { getRuntimeEnv } from './framework/utils.js';

configureConfigBuilder((env) => ({
  telegramBotToken: getRuntimeEnv("TELEGRAM_BOT_TOKEN", env),
  ownerChatId: getRuntimeEnv("OWNER_CHAT_ID", env)
}));
```

`getRuntimeEnv(key, envObj?)` resolves environment variables across all runtimes:
- **Cloudflare Workers**: reads from the `env` binding object passed to `fetch()`.
- **Node.js (Vercel, Netlify)**: reads from `process.env`.
- **Deno / Val Town**: reads from `Deno.env`.

Always prefer `getRuntimeEnv` over direct `process.env` access to keep your bot code runtime-agnostic.

Then in your platforms:
* **Cloudflare Workers / Deno / Val Town**:
  ```javascript
  import { handleWebRequest } from './lib/framework/adapters.js';
  export default {
    async fetch(req, env, ctx) {
      return await handleWebRequest(req, env, ctx);
    }
  }
  ```
* **Vercel Functions**:
  ```javascript
  import { handleVercelRequest } from '../lib/framework/adapters.js';
  module.exports = async (req, res) => {
    return handleVercelRequest(req, res);
  };
  ```

---

### 2. Command Router
Register bot commands with priority sorting and conditional authorization filters:

```javascript
import { registerCommand } from './framework/router.js';

registerCommand('start', async (message, context) => {
  const { token, chatId } = context;
  await callTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text: "Welcome!"
  });
}, { priority: 200 });

// Scoped command only accessible to the bot owner
registerCommand('settings', handleSettings, {
  priority: 100,
  condition: (message, isOwner) => isOwner
});
```

* **Command Menu Formatting (setMyCommands)**:
  Telegram's client-side popup command list (registered via `setMyCommands` API) accepts strictly plain text (maximum 256 characters)
  and does not support Markdown formatting or links.
  Any formatting syntax will fail API submission or render raw characters.
  To handle this, the framework expects descriptions to be parsed with a utility like `stripMarkdown` to extract clean plain text anchors.
* **Dynamic `/help` Text Formatting**:
  Unlike client-side menus, inline command lists (e.g. `/help` responses) support full MarkdownV2 features.
  To keep inline links clickable without triggering strict parsing exceptions,
  description parsers should separate text sections from link sections and escape only the plain text segments.

---

### 3. Interactive Keyboards Menu Engine
Define state-based menus where changes automatically update the inline keyboard:

```javascript
import { registerMenu, openMenu } from './framework/menu.js';

registerMenu('main', {
  title: (settings, extraCtx) => `*Settings Menu*\nActive Model: ${settings.model || 'Default'}`,
  buttons: (settings, extraCtx) => [
    [
      { 
        text: 'Toggle Verbose Mode', 
        callback_data: 'toggle:verbose' 
      }
    ],
    [
      { 
        text: 'Select Model', 
        callback_data: 'submenu:models' 
      }
    ]
  ],
  onAction: async (action, value, settings, extraCtx) => {
    if (action === 'toggle' && value === 'verbose') {
      settings.verbose = !settings.verbose;
      return { refresh: true, alert: "Verbose mode toggled!" };
    }
    return { refresh: false };
  }
});
```

To display a menu or handle incoming clicks (`callback_query`):
```javascript
// Open the menu
await openMenu(token, chatId, 'main', settings, extraCtx);

// Pass callback queries to the engine
import { handleCallbackQuery } from './framework/menu.js';
await handleCallbackQuery(token, callbackQuery, settings, extraCtx);
```

#### 💾 In-Memory Menu Caching & `openOrUpdateMenu`

The framework maintains an in-memory `LAST_MENU` map to track the active menu message ID for each chat (allowing in-place edits and automatically deleting incoming command messages in case of successful updates).

##### API:
```javascript
import { openOrUpdateMenu } from './framework/menu.js';

// Checks if the menu is already open in the chat:
// - If yes: updates it in-place and deletes the triggering message (if triggerMessageId is provided).
// - If no (or if the message was deleted in Telegram): opens a new menu message.
await openOrUpdateMenu(menuId, token, chatId, settings, lang, ctx, triggerMessageId);
```

##### ⚠️ Caching Limitations & Behaviors:
1. **Single Active Menu per Chat**: The cache only tracks the **latest** menu message ID per `chatId`. If you open multiple menus in the same chat, only the last one can be updated in-place; interactions with older menus will trigger a fallback to open a new menu message.
2. **Ephemeral Memory (Serverless Lifespans)**: The cache is stored in a standard Node/Deno in-memory `Map`. In serverless environments (Vercel, Netlify, Cloudflare Workers), instances are recycled frequently. When an instance is cold-started, the cache is empty.
3. **Seamless Fallback**: When the cache is empty or if the message to edit was deleted on the Telegram server, `openOrUpdateMenu` automatically catches the failure and falls back to sending a new menu message, ensuring user interaction is never blocked.

#### 🗺️ Navigation and Automatic Button Rendering

When opening or updating a menu, you can pass a `backMenuId` parameter (`openMenu(menuId, token, chatId, settings, lang, ctx, backMenuId)`):
- **`backMenuId` is a string (e.g. `'main'`)**: Shows a **Back** button pointing to that menu ID.
- **`backMenuId` is `null`**: Handled automatically. The framework decides dynamically which buttons to render:
  - If the menu is configured with `isMain: true` when registered, only a **Close** button is rendered.
  - If the menu is a sub-menu, a **Close** button is rendered. If a main menu has been registered with `isMain: true`, a **Main** button (pointing to that main menu) is also rendered.
- **`backMenuId` is `false`**: Hides all navigation/footer buttons.

The framework automatically discovers the main menu ID by looking for a registered menu with the `isMain: true` property:
```javascript
registerMenu('config', {
  isMain: true,
  getTitle: (settings, lang) => "Settings",
  getButtons: (settings, lang) => [...]
});
```
This avoids hardcoding menu structures in the core framework files. Clicking the **Close** button triggers the `nav:close` action, which automatically deletes the menu message and answers the callback query.

#### 🧼 Automatic Button Text Sanitization

Telegram inline keyboard buttons support strictly plain text. They do not render Markdown formatting or clickable links.
To prevent payload errors or raw markdown showing on buttons, the framework automatically sanitizes button texts before rendering:
- **Markdown Links**: Converts links like `[model](https://...)` to their plain text content (`model`).
- **Formatting Markers**: Strips markdown formatting characters such as `*`, `_`, `` ` ``, and `\`.
- **First Line Extraction**: If a multiline translation (which includes descriptions) is passed as button text, it automatically extracts only the first line.
- **Trailing Colons**: Automatically strips trailing colons (`:`) and trims trailing whitespace.

This allows developers to safely pass raw localization entries directly as button text.

##### 🎯 The Scenario: Single Source of Truth (DRY Localizations)
Often, a bot wants to use the exact same translation entry (e.g. `modelTitle`) for two different presentation contexts:
1. **The menu body/instructions**: where we want rich text formatting, clickable links to documentation, and multiline descriptions:
   `🧠 *Transcript: [model](url):*\nSelect the AI model used for transcription.`
2. **The menu button labels**: where Telegram only permits clean, plain text:
   `🧠 Transcript: model`

Instead of duplicating the translation dictionary with multiple variants (like `modelTitle` and `modelTitleButton`), developers can write one rich translation string. The framework automatically parses and formats the first line for the keyboard button, keeping the codebase clean and maintenance-free.

---

### 4. Parameterized Admin Dashboard
Expose a beautiful status-check and configuration page by instantiating the generic dashboard:

```javascript
import { makeDashboardHandler } from './framework/dashboard.js';
import { registerHttpRoute } from './framework/router.js';

const handleDashboard = makeDashboardHandler({
  botNameDefault: 'My Custom Bot',
  botDescriptionDefault: 'This bot does amazing things.',
  repoUrl: 'https://github.com/username/my-bot',
  repoName: 'my-bot',
  logoSvg: `<svg viewBox="0 0 24 24">...</svg>`,
  getSettingsSchema: (oldSettings) => ({
    owner: oldSettings.owner || '',
    verbose: oldSettings.verbose !== undefined ? oldSettings.verbose : false,
  }),
  getChecks: (config) => [
    { 
      name: 'BOT TOKEN', 
      ok: !!config.telegramBotToken, 
      errorMsg: 'TELEGRAM_BOT_TOKEN is missing!' 
    }
  ],
  // Inject bot-specific localization helpers from your bot layer.
  getUserLang: (settings, acceptLang) => resolveBotLang(settings, acceptLang),
  getMarkdown: (lang, key, params) => botMarkdown(lang, key, params)
});

// Bind to root route
registerHttpRoute('/', handleDashboard);
```

---

### 5. Localization Engine
Define localization rules and query text templates dynamically:

```javascript
import { configureLocalization, getTranslation, getMarkdown } from './framework/localize.js';

const translations = {
  en: {
    welcome: "Hello, {name}!"
  },
  ru: {
    welcome: "Привет, {name}!"
  }
};

configureLocalization(translations);

// Fetch a raw translation string
const greeting = getTranslation('welcome', 'en', { name: 'Alice' }); // "Hello, Alice!"

// Fetch and escape automatically for MarkdownV2 safety
const safeGreeting = getMarkdown('welcome', 'ru', { name: 'Иван' }); // "Привет, Иван\\!"
```

* **Selective Localized Metadata Registration**:
  To keep the Bot API metadata registration clean and prevent empty descriptions or errors,
  the localization framework allows registering command metadata *only* for languages that explicitly define descriptions
  in the translation dictionary.
  If a language lacks keys, registration is skipped for that locale, letting Telegram's default global fallback (English) take over.

#### 🏷️ Placeholder Modifiers
When interpolating parameters in localization strings, you can format them dynamically using the `{placeholderName:modifier}` syntax in your templates:

* **`:code`**: Automatically wraps the value in backticks (\`...\`) and escapes it using `escapeMarkdownV2Code` (ideal for environment variable names, settings, keys, etc.).
  * *Template:* `Please set the {key:code} environment variable.`
  * *Input:* `{ key: 'WHISPER_API_KEY' }`
  * *Result:* `Please set the \`WHISPER_API_KEY\` environment variable.`
* **`:codeblock`**: Automatically wraps the value in a code block (\`\`\`\n...\n\`\`\`) and escapes it using `escapeMarkdownV2Code` (ideal for multiline stack traces, logs, or JSON strings).
  * *Template:* `*Error Detail:* {error:codeblock}`
  * *Input:* `{ error: 'Stack trace...' }`
  * *Result:* `*Error Detail:* \`\`\`\nStack trace...\n\`\`\``
* **`:raw`**: Inserts the value raw without applying any Markdown escaping (ideal for passing pre-formatted markdown strings like user lists, complex nested links, etc.).
  * *Template:* `{context:raw}`
  * *Input:* `{ context: '*Chat ID:* \`12345\`\n*User:* [John](tg://user?id=1)' }`
  * *Result:* `*Chat ID:* \`12345\`\n*User:* [John](tg://user?id=1)`

---

### 6. MarkdownV2 Escaper & HTML Translator
Telegram's `MarkdownV2` parser is strict. Plain text parameters must have reserved symbols escaped to prevent payload delivery errors (`400 Bad Request`). For the full list of characters requiring escaping, refer to the [Telegram Bot API MarkdownV2 documentation](https://core.telegram.org/bots/api#markdownv2-style).

```javascript
import { escapeMarkdownV2, htmlToMarkdownV2, md, raw, escapeMarkdownV2Link } from './framework/markdown.js';

const escapedText = escapeMarkdownV2("Version 1.0.0 is out! (Yay)"); 
// "Version 1\\.0\\.0 is out\\! \\(Yay\\)"

const convertedMarkdown = htmlToMarkdownV2("<b>Bold</b> and <i>Italic</i>");
// "*Bold* and _Italic_"

// Using the md tagged template literal:
const name = "John-Doe";
const url = "https://example.com/path-with-dashes";
const text = md`Hello *${name}*! Visit [website](${raw(escapeMarkdownV2Link(url))})`;
// "Hello *John\\-Doe*! Visit [website](https://example.com/path-with-dashes)"
```

> [!NOTE]
> **Design Rationale: MarkdownV2 vs. HTML**
> Although Telegram's MarkdownV2 is fragile (requiring escaping for characters like `-`, `.`, `!`), the framework retains MarkdownV2 to avoid migrating existing multi-language translation dictionaries (`localize.js`) to HTML tags (e.g. `<b>`, `<i>`), which represents a major legacy blocker. Instead, the framework mitigates this by:
> 1. Providing the `md` tagged template literal helper to automate parameter escaping at interpolation time.
> 2. Running a strict MarkdownV2 parser check (`validateMarkdownV2`) on all compiled help texts during localization tests.
> 3. Enforcing a global fallback in `callTelegram` that automatically retries failed requests without `parse_mode` if entity parsing fails.

* **Codebase Rules**: Always specify `parse_mode: 'MarkdownV2'` and `disable_web_page_preview: true` in Telegram API payload configurations. Use `getMarkdown` for translation templates and `escapeMarkdownV2` for manual variables.

---

### 7. Telegram Rich Messages (Bot API 10.1+)
For highly structured layouts, Telegram Bot API 10.1+ supports **Rich Messages** (enabling lists, tables, and headings) via the `sendRichMessage` method. For details on parameters and schema fields, refer to the [Telegram Bot API Rich Messages documentation](https://core.telegram.org/bots/api#rich-messages).

* **Code Example**:
  ```javascript
  await callTelegram(token, 'sendRichMessage', {
    chat_id: chatId,
    rich_message: {
      markdown: '# Title\n\n- Bullet 1\n- Bullet 2'
    }
  });
  ```
* **Graceful Fallback**: Since Rich Messages are a newly introduced feature, some client versions may not fully support their rendering yet. To ensure maximum compatibility, the framework catches failures and falls back to standard `MarkdownV2` plain messages.

---

### 8. Webhook Processing Engine
The framework provides a plug-and-play webhook listener that handles payload deduplication, secret validation, and routing of incoming updates:

```javascript
import {
  configureWebhookFramework,
  registerUpdateHandler,
  registerErrorHandler,
  handleWebhook,
  clearDeduplicationCache
} from './framework/webhook.js';

configureWebhookFramework({
  // Convert webhook query params into your bot-specific settings object.
  parseSettingsFromQuery: (query) => parseMyBotSettings(query)
});

// Register handlers for specific update types
registerUpdateHandler('message', async (message, ctx) => {
  // Process text messages, files, etc.
});
registerUpdateHandler('callback_query', async (query, ctx) => {
  // Process settings menu buttons callback queries
});

registerErrorHandler(async (error, { token, ownerId, settings }) => {
  console.error("Critical Webhook Error:", error);
});

// In tests only: reset the in-memory deduplication cache between test runs
clearDeduplicationCache();
```

* **Deduplication Set Cache**: The framework maintains a FIFO cache of up to 1000 recently handled `update_id`s in memory to suppress rapid retries from Telegram during serverless cold starts.
* **`clearDeduplicationCache()`**: Clears the in-memory FIFO set. Intended exclusively for test environments to reset state between test runs; never call in production.
* **Webhook Secret Verification**: Incoming post requests are automatically checked against the `x-telegram-bot-api-secret-token` header matching the SHA-256 hash of the bot token.

---

### 9. Generic Setup and Reply Helpers

The framework provides reusable builders for setup and response flows. Bot-specific parsing,
webhook serialization, and post-registration behavior are supplied by the caller:

```javascript
import { makeWebhookSetupHandler } from './framework/setup.js';
import { buildReplyRequest } from './framework/reply.js';

const handleSetup = makeWebhookSetupHandler({
  parseWebhookConfig: (webhookInfo) => parseMyBotSettings(webhookInfo),
  buildWebhookSetup: (baseUrl, token, settings, secret) => ({
    url: buildMyWebhookUrl(baseUrl, settings),
    secret_token: secret,
    allowed_updates: ['message']
  }),
  getDefaultSettings: () => ({ owner: '', verbose: false }),
  onAfterSetup: async ({ token }) => syncMyBotProfile(token)
});
```

* **`makeWebhookSetupHandler(...)`**: Factory for `/api/setup` style handlers with pluggable settings parsing and webhook payload construction.
* **`buildReplyRequest(...)`**: Builds Telegram request payloads for normal chats and guest queries from a unified call site.

Use these helpers from your bot layer to keep `lib/framework/*` runtime-agnostic and free of bot-specific imports.

---

### 10. Bot Profile Metadata Helpers

`setupBotProfile` in `framework/bot-profile.js` synchronizes Telegram command and profile metadata.
Provide the bot's settings and translation data explicitly:

```javascript
import { setupBotProfile } from './framework/bot-profile.js';

await setupBotProfile(token, {
  getTranslation,
  getTranslations: () => translations,
  getSettings: getWebhookConfig,
  languages: ['', 'en', 'ru']
});
```

The framework does not define translation content, choose supported languages, or retrieve settings
itself.

---

### 11. Automatic `/help` Generation & Commands Scope Synchronization
Expose dynamic commands generation and registration:

```javascript
import { generateHelpText, syncBotCommands } from './framework/router.js';
import { syncBotMetadata } from './framework/utils.js';

// 1. Generate localized help text dynamically from the COMMAND_REGISTRY
const helpText = generateHelpText(
  isMsgFromOwner, 
  langCode, 
  botVersion, 
  "Hello! I am a bot.", 
  "Owner Settings:", 
  getTranslation
);

// 2. Synchronize command menu scopes with Telegram API
await syncBotCommands(token, ownerChatId, langCode, getTranslation);

// 3. Synchronize bot name, description, and short description localized metadata
await syncBotMetadata(token, langCode, "MyBot", "This is MyBot", "A fast serverless bot");
```

---

### 12. Unified Health Check API
Expose a standardized endpoint report with version numbers, crypto validations, and secure diagnostics:

```javascript
import { handleHealthCheck } from './framework/router.js';

// Register standard route, extending it with bot-specific dependency tests
registerHttpRoute('/api/health', (requestInfo, config) => {
  return handleHealthCheck(requestInfo, config, async (req, cfg) => {
    return {
      ok: true, // dictates 'healthy' vs 'degraded' status
      config_checks: {
        databaseConnected: true
      },
      tests: {
        custom_db_test: { ok: true }
      }
    };
  });
});
```

---

## 📋 Developer & Platform Guidelines


When developing bots or adding features using this framework, please adhere to these coding and localization conventions:

1. **Avoid Hardcoding URLs**:
   Do not hardcode external URLs (such as repository links or help guides) directly in localized translation dictionaries.
   Instead, define them as constants in your application core or localization setup and interpolate them dynamically.
2. **Console Logs English Rule**:
   All terminal, debug, and system console logs (`console.log`, `console.warn`, `console.error`) **must always remain in English**
   to facilitate standardized operations and cloud log monitoring (e.g. on Vercel or Netlify logs).
3. **No Dashboard/Setup Localization**:
   Administrative web interfaces (such as the setup page HTML, webhook registration responses, and JSON API error payloads)
   are meant for developers and system operators.
   They do not require multi-language translations and should be written in English.
