# DEVNOTES: Architecture, Configuration, and Integration 🛠️⚙️

This document describes the core architecture, configuration parameters, localization mechanics, and reliability policies of the **Telegram Voice Transcribot** bot.

For details on the underlying database-less, cross-platform serverless engine (request adapters, command routing, interactive menus, generic dashboard, 429 rate limit protection, and markdown engines), see the [Serverless Telegram Bot Framework Documentation](lib/framework/README.md).

For specific details regarding audio formats, see `FORMATS.md`.

---

## ⚠️ Core Documentation Rule
**DEVNOTES answers "WHY", not "HOW EXACTLY".** 
To prevent creating a second source of truth that drifts from the codebase, detailed mechanics, edge-cases, and behavioral specifications MUST be maintained within the automated test suites (`tests/*.mjs`), which are all executed together via `npm run test`. This document should only outline high-level architecture, design rationale, and references to those tests. For instructions on how to run tests, configure local dev servers, or use debugging tools, refer to [tests/README.md](tests/README.md).

**All notes, architecture guides, API references, and documentation regarding the generic serverless framework (adapters, routing, keyboard menus, markdown escaper, localization engine, and dashboard) MUST be kept in the [Serverless Telegram Bot Framework Documentation](lib/framework/README.md) rather than in this file.**

---

## Part I: Core Bot Configuration & Routing

### Framework Boundary

Transcribot keeps product behavior in `lib/` and reusable Telegram/serverless mechanisms in
`lib/framework/`. The bot layer owns the webhook settings schema, localization dictionary,
Whisper orchestration, commands, menus, and dashboard configuration. The framework owns generic
request adapters, HTTP dispatch, Telegram API helpers, webhook verification/deduplication,
Markdown handling, generic menus, and setup/reply factories.

The boundary is dependency-inverted: `lib/core.js`, `lib/dashboard.js`, and `lib/commands.js`
pass bot-specific parsers, serializers, localization helpers, settings accessors, and post-setup
hooks into framework APIs. Framework modules must not import Transcribot modules such as
`lib/localize.js` or `lib/webhook-settings.js`. This lets the same framework serve another bot
without coupling it to Transcribot settings or Whisper terminology.

The concrete injection contracts and their regression coverage live in
`tests/framework/unit_webhook.mjs` and `tests/framework/unit_utils.mjs`.

---

### 1. Stateless Configuration Parameters

All runtime configurations and user settings for Transcribot are stored directly inside the registered Telegram webhook URL as query parameters.

#### Webhook URL Format

```
https://your-bot.example.com/api/webhook?groups=off&lang=ru&model=whisper-large-v3&verbose=on&...
```

#### Parameters and Their Meaning

| Parameter | Values | Default | Description |
|---|---|---|---|
| `owner` | Telegram Chat ID | (empty) | Owner's Telegram chat ID for authorization, setup, and notifications. |
| `groups` | `on` / `off` / `leave` | `on` (absent = `on`) | Controls whether the bot processes audio/video messages in groups. If `leave`, it ignores messages and automatically executes `leaveChat` when added to a new group or upon receiving a message in an existing group. |
| `lang` | ISO code or `auto` | `auto` | Target transcription language for the Whisper API. |
| `langbot` | `en`, `ru`, `de`, `uk`, or `auto` | `auto` | Bot UI language (fallback for system messages and keyboards). |
| `autodetect` | `on` / `off` | `on` (absent = `on`) | Toggles automatic interface language detection for the bot's UI. |
| `model` | Model name string | First in `WHISPER_MODELS` | The Whisper model string sent to the transcription API. |
| `notify_add` | `on` / `off` | `on` (absent = `on`) | Sends owner an alert when the bot is added to new group chats. |
| `notify_conn` | `on` / `off` | `on` (absent = `on`) | Sends owner an alert on Telegram Business connection changes. |
| `notify_err` | `on` / `off` | `on` (absent = `on`) | Sends owner an alert if any transcription request fails. |
| `verbose` | `on` / `off` | `off` | Appends technical file details to transcription replies. |
| `secpriv` | `on` / `off` | `off` | Secretary private delivery: transcriptions of business messages are sent to the owner's private chat with the bot instead of the business chat, so the chat partner does not see them. Verified in `tests/scenarios/secretary.mjs`. |
| `fmt` | `sparkle` / `classic` / `abc` / `quote` / `expand` / `plain` | `sparkle` | Transcript message style, picked in `/format` (menu shows a live preview of every style). Rendering lives in `renderTranscriptChunk` (`lib/utils.js`); chunk splitting always reserves room for the longest (classic) header. Verified in `tests/bot/unit_formats.mjs`. |
| `tr` | `on` / `off` | `on` | Output mode 1: post the transcript into the business chat. When off, the transcript goes privately to the account owner instead. |
| `polish` | `on` / `off` | `on` | LLM cleanup (punctuation, sentences, fillers, phonetic English terms) before posting. Falls back to the raw transcript on error or when the result length drifts outside 0.6-1.3x, because a large drift means the model rewrote or truncated the speech. |
| `sum` / `rep` | `on` / `off` | `on` | Output modes 2 and 3: summary (only for texts >= 300 chars) and three reply options, generated in one JSON call and sent only privately: to the connected business account owner for incoming business voices, or into the private chat for voices sent to the bot directly. Never into the conversation, and never to another account's owner, so a teammate's business chats cannot leak to the bot owner. |
| `prompt` | URL-encoded string | (absent = uses `WHISPER_PROMPT` env, or no prompt) | [Custom][Whisper prompting guide] [Whisper] prompt (max ~224 tokens). Empty (`prompt=`) disables prompt. Note: When saved in the webhook URL, the prompt is truncated from the left (keeping the end) to fit within the [~224][OpenAI Speech to Text Guide] tokens limit. |
| `ALLOWED_USERS` | Comma-separated user IDs / usernames | (empty = everyone) | Env-only access whitelist. The owner is always allowed; private, group and guest messages from others are ignored, as are business connections of non-listed accounts. Verified in `tests/scenarios/core.mjs` and `tests/scenarios/secretary.mjs`. |
| `OWNER` | User ID or Username | (empty) | Pre-configured owner ID/username (env variable `OWNER`) to restrict dynamic registration hijacking. |

[Whisper]: https://openai.com/index/whisper/
[Whisper prompting guide]: https://developers.openai.com/cookbook/examples/whisper_prompting_guide
[OpenAI Speech to Text Guide]: https://developers.openai.com/api/docs/guides/speech-to-text

*Detailed edge cases for settings parameters are verified in `tests/units.mjs` and `tests/scenarios.mjs`.*

#### Key Parameter Details & Policies

The detailed edge cases and exact implementation policies for the following features are codified as executable specifications in the automated test suite (`tests/units.mjs`, `tests/scenarios.mjs`, and `tests/whitebox.mjs`). Please refer to the tests as the primary source of truth for:

* **Custom Prompt Constraints & Defaults** (Unit Tests)
* **Bot UI Language Resolution Flow** (Unit Tests)
* **Webhook Parameters & State Management (Guest/Secretary Modes)** (Unit Tests and Scenarios)
* **Audio Format Detection & WAV Wrapping (`detectAudioFormat`, `wrapAacInWav`, `wrapCafInWav`, `wrapRawAudioInWav`)** (Unit Tests)
* **Bot Addressing and Mentions (`hasBotMention` & `isMessageDirectedToBot`)** (Unit Tests)
* **Mode Menu Capability Validation & Out-of-Sync Recovery** (Scenarios Tests): *Why does the bot re-fetch its own capabilities before toggling modes?* Telegram Bot capabilities (like `can_join_groups` or Guest support) can be modified by the owner via BotFather without notifying the webhook. To prevent the bot from attempting to manage an unavailable mode—or from rendering an interactive button that isn't actually functional—the `mode` menu strictly validates its current capabilities against a fresh `getMe` call on every toggle action. If the UI state doesn't match the actual capability, it rejects the action, alerts the user, and refreshes the menu.

#### Error Classification and Notification Policy

To maintain a clean user experience while ensuring that administrators are aware of critical system failures, errors are categorized into three levels:

| Category | Description | Examples | Handling Behavior |
|---|---|---|---|
| **Critical Errors** | Severe issues that block core bot operations or message delivery. | Runtime exceptions (`TypeError`), Whisper API failures, or Telegram API message delivery failures (e.g., bad Markdown parsing). | Caught in the deferred tasks handler and logged, and additionally sent directly as a stack-trace notification to the owner's Telegram chat (if `notify_err` is enabled). |
| **User-Facing Warnings** | Expected operational issues that affect the user's current request. | File size limit exceeded (>20MB), unsupported media formats (archives, PDF, etc.), or missing Whisper API keys. | Sent as a user-friendly error message reply in the active chat. Ignored for owner alerts. |
| **Non-Critical Logs** | Standard operational events that do not impact overall health. | Unauthorized command attempts by non-owners, duplicate Telegram `update_id` payloads. | Written strictly to the server's platform console logs (`console.log` / `console.warn`). No message is sent. |

*Verified by the "Critical exception in webhook loop..." scenario in `tests/scenarios.mjs`.*

---

### 2. HTTP Routing & Platform Entrypoints
The bot registers its handlers on the framework's HTTP router (`lib/framework/router.js`):
* **`/api/webhook`**: Receives updates from Telegram (dispatched to `handleWebhook` in `lib/core.js`).
* **`/api/setup`**: Setup endpoint for webhook registration/reset (dispatched to `handleSetup` in `lib/core.js`).
* **`/api/health`**: Health status and diagnostics checks (dispatched to `handleHealthCheck` in `lib/core.js`).
* **`/`**: Configuration web panel dashboard (dispatched to `handleDashboard` in `lib/dashboard.js`).

Platform-specific redirects (e.g., `vercel.json` and `netlify.toml`) route incoming traffic to these endpoints, which are normalized and handled by `lib/framework/adapters.js`.

---

### 3. Webhook Setup, Registration & Security
* **Dynamic Owner Registration**: To allow a database-less architecture, the bot dynamically assigns its first private-chat user as the owner by updating the webhook URL state. During this "unclaimed" state, group, guest, and secretary events are discarded to prevent security leaks. 
* **Dashboard Pre-flight Security**: The dashboard attempts to automatically register the webhook to simplify deployment. To prevent local dev environments from accidentally overwriting a live production webhook, the dashboard runs a strict validation check on its own URL before communicating with the Telegram API.
* **Owner Reset Mechanics**: The dashboard provides a "Reset Owner" action to allow the bot to be transferred to a new administrator, provided the request is authorized with the secure token.
* **The `/webhook` Command**: Allows the owner to view or migrate the active webhook URL directly from the Telegram interface. To prevent breaking the bot, the command performs pre-flight health checks before migrating, and securely inherits configuration parameters.
* **Manual Webhook Registration**: If auto-registration is not preferred or fails, the webhook can be manually registered:
  1. **CLI Script**:
     ```bash
     npm run set-webhook -- https://your-bot.example.com
     ```
  2. **Setup Endpoint**: Make a `GET` or `POST` request to `/api/setup` with your `token`.

*Verified in `tests/scenarios.mjs`.*

---

### 4. Network Request Timeouts
To prevent execution hanging, the bot overrides or implements specific timeout boundaries as described in [Framework Abort Timers](lib/framework/README.md#4-rate-limit-handling-429--abort-timers):
* **Telegram API (`callTelegram`)**: Enforced using `TELEGRAM_API_TIMEOUT` in the `lib/framework/utils.js`.
* **Audio Downloads & Whisper API Transcriptions**: Enforced using `DOWNLOAD_TIMEOUT` and `TRANSCRIBE_TIMEOUT` in the `lib/transcriber.js`.
  * **Dynamic Configuration for Timeouts**: The transcription timeout value can be overridden via the `TRANSCRIBE_TIMEOUT` environment variable. To support serverless environments (like Cloudflare Workers) where environment variables are bound to the fetch request arguments rather than global scopes, this variable is resolved dynamically at request time via `config.transcribeTimeout` using the framework's `getRuntimeEnv` helper, falling back to a load-time constant of 60 seconds.
* **Health Checks (`/health`) & README Fetch (`/readme`)**: Enforced using `README_FETCH_TIMEOUT` and `HEALTH_CHECK_TIMEOUT` in the `lib/commands.js`.

---

### 5. Dynamic Versioning
The project propagates its version dynamically across different runtimes (Node.js, Deno, Cloudflare Workers) as detailed in [Dynamic Version Propagation](lib/framework/README.md#5-dynamic-version-propagation).
The configuration builder validates this version propagation and handles missing configuration fallbacks, which is verified by `testConfigGeneration` in `tests/units.mjs`.

---

### 6. Deno Compatibility & Tasks
To ensure first-class support for Deno Deploy, the project includes a `deno.json` configuration file at the root.
* **Task Mapping**: Scripts defined in `package.json` are mirrored as Deno tasks in `deno.json`.
* **Sync Verification**: The consistency between Node NPM scripts and Deno tasks is strictly enforced by the automated unit test `testDenoPackageSync` in `tests/units.mjs`.
* **Sandbox Permissions**: Running the test tasks in Deno requires basic security flags (`--allow-read`, `--allow-write`, `--allow-env`) to access environment configurations, write temporary test assets, and read localized assets.

---

### Speech-to-text engine (`lib/transcriber.js`)

With `ELEVENLABS_API_KEY` set, ElevenLabs Scribe (`SCRIBE_MODEL`, default `scribe_v2`) transcribes first: noticeably more accurate on conversational Russian mixed with English (e.g. "в кабинете", "до семи, семи тридцати" where Whisper turbo gave "кг"). Scribe words are grouped into sentence segments with mean word log-probability, so `assessTranscription` works unchanged. Any Scribe error (quota, 401, timeout 7 s) falls back to Whisper on Groq; empty Scribe text (silence) is not retried, Whisper hallucinates there. Costs ElevenLabs plan minutes (~30 min/month of incoming voices). `WHISPER_PROMPT` applies only to Whisper.

### Lost segment repair (`lib/transcriber.js`, `lib/ogg.js`)

Whisper sometimes collapses a ~30 s window of real speech into a couple of words (often a term from `WHISPER_PROMPT`, e.g. "Claude Codem") or a subtitle credit ("Субтитры делал DimaTorzok"). After the main call, segments that are a known hallucination or have < 4 letters/s over >= 6 s are cut out of the Ogg Opus file (page-level slicing, no ffmpeg) and re-transcribed without the prompt, up to 3 ranges in parallel. Costs one extra Whisper request (~1 s) only when something was lost.

### LLM extras (`lib/insights.js`)
Groq chat model `qwen/qwen3.8-27b` (override: `INSIGHTS_MODEL`) is fast enough (~1 s) to fit cleanup + extras into the 10 s function budget; `gpt-oss-120b` took 3-6 s. On HTTP errors (e.g. 429 - Groq free tier is 8k tokens/min per model) the call retries once on `gpt-oss-120b`, which has its own rate-limit bucket; timeouts are not retried because the time budget is already spent. Insights start in parallel with the cleanup and are delivered after the transcript. Usage reality check (2026-10): ~30 incoming voices/month, max 6/day, so limits are not a concern.

### Reply buttons (`lib/core.js` → `deliverInsights` / `handleRepliesCallback`)
Reply options are code blocks labelled `1-`, `2-`, `3-` with an inline keyboard: `rp:<id>:<n>` sends option n into the business chat as the account owner (`business_connection_id` + `reply_parameters` on the voice), then swaps the keyboard for a "sent" mark; `rg:<id>` regenerates three new options (`generateReplies`, previous ones passed as "already suggested") and edits the message. Voices sent to the bot directly get only the regenerate button. State (`{to, bc, chat, msg, name, text, replies, seen}`) lives in KV under `r/<id>` because callback data is limited to 64 bytes; only the user the options were delivered to (`to`) may press the buttons.

### KV store (`lib/kv.js`)
Netlify Blobs store `ponch` (`connectNetlifyKv(event)` in `netlify/functions/webhook.js` - Lambda-style functions must call `connectLambda` first); everywhere else (tests, other platforms) an in-memory map. Failures are logged and treated as "no value".

## Part II: Bot Logic & Command Handling

### 7. Profile & Avatar Automation
To claim the bot ownership, the owner starts the bot in a private chat. The bot then auto-configures its own Telegram profile Name, Description, Short Description, and commands menu dynamically:
* **Plain Text Constraint**: Telegram's command registration API accepts strictly plain text. The bot automatically strips formatting and resolves Markdown links to anchors before registering.
* **Scope Isolation**: Admin commands are chat-scoped (`BotCommandScopeChat`) and visible only to the registered owner's chat. Regular users only see public commands in the default scope.
* **Allowed Owner Verification Gate**: If the `OWNER` environment variable (mapped to `config.allowedOwner`) is set, the bot checks the sender's user ID and username against it. Private messages from any other users are discarded, preventing unauthorized claiming of ownership.
* **Avatar Upload**: The bot searches the root directory for `avatar.jpg`, `avatar.png`, or `avatar.jpeg` and automatically uploads it via `multipart/form-data` to set the profile picture.
* **Dynamic Refresh & Cache Bypass**: Because Telegram clients aggressively cache the command list locally, the bot dynamically updates the user's chat-scoped menu on every `/start` or `/help` command. This forces the Telegram server to trigger an immediate menu reload, bypassing the client-side cache and ensuring both guests and owners see their respective menu layouts instantly.
* **Profile Metadata & /setbotinfo**: The profile fields `setMyName`, `setMyDescription`, and `setMyShortDescription` are updated when the owner first claims the bot (`sendOwnerGreeting`). The owner can also refresh/re-apply these settings on-demand at any time by sending the `/setbotinfo` command.
* **Avatar Upload CLI**: In addition to auto-uploading, setting the bot's avatar photo can be triggered manually using the helper script `scripts/ops_set_avatar.js`.

*Codified in `lib/commands.js` and verified by `testBotAvatarAutomation` in `tests/units.mjs` and the "Private message dynamic owner registration constraints (allowedOwner)" scenario in `tests/scenarios.mjs`.*

---

* **Profile sync is commands-only**: the bot name and descriptions are set by hand in BotFather; automatic sync used to overwrite them on every setup/greeting/language change, so only the command list is synchronized now.

### 8. `/prompt` Command & Source Parsing
The `/prompt` command is used to inject instruction cues into Whisper. The bot parses commands differently depending on three cases:

| Case | Structure | Command source | Caption used? | Reply cites |
|------|-----------|---------------|---------------|-------------|
| **1** | Message A (text-only) replies to message B (has file) | `message.text` of A | ❌ Never | Message B (the file message) |
| **2** | Message itself contains the file | `message.text` OR `message.caption` | ✅ Only here | Same message |
| **3** | Forwarded message with a file | `message.text` only | ❌ Never | Same message |

#### Design Rationale & Reply Target:
* **Case 1 (reply-to)**: When the user sends `/prompt text` as a reply to a previously sent voice message, the command text lives in `message.text` (no file in the current message). The bot must quote the *original* voice message in its reply — not the command message — so the result is contextually anchored to the audio.
* **Case 2 (inline caption)**: When a file (voice, audio, document) is sent together with a `/prompt text` caption in the same message, the caption is the natural home for the command. This is the only case where `message.caption` is parsed for commands.
* **Case 3 (forwarded)**: A forwarded message's caption belongs to the original sender and must never be treated as a command by the recipient bot. The `forward_from`, `forward_origin`, or `forward_from_chat` fields are used to detect forwards and suppress caption-based command parsing.

*Verified in `tests/scenarios.mjs` (scenarios "/prompt as caption...", "/prompt command... as a reply...", "Non-owner /prompt...", "Forwarded voice with /prompt caption...", "Multiline /prompt...").*

---

### 9. Secretary Mode (Business Connections)
Intercepts messages in the owner's personal chats via `business_message` updates.

> [!NOTE]
> **Terminology Clarification:** Although Secretary Mode is powered by the Telegram Business API (utilizing `business_message` updates), it has nothing in common with other Telegram Business automation features (such as Business Guest Mode). To avoid confusion, a "guest" (non-owner user) in regular individual or group chats is a standard user role and has absolutely no relation to Business Guest Mode or business connections.

* **Silently Ignores Daily Chat**: To prevent the bot from spamming chat partners with error messages or default greetings, the bot runs silently and only processes voice notes that address the owner or are explicitly directed to the bot.
* **Quiet Chats (business & guest)**: A chat with another person must never receive bot noise. Errors, notices (file too large, missing key, unsupported format), command replies and verbose footers are only logged or sent to the owner's private chat; the only thing posted there is a transcription that passed the quality check. Whisper invents text on silence, music and noise (e.g. "Продолжение следует...", subtitle credits), so `verbose_json` segment confidence plus a hallucination phrase list rates each result as good (posted), doubtful (sent privately to the owner, who decides) or bad (dropped) instead of embarrassing the owner in front of the chat partner. Behavior is pinned by the "Quiet chat" tests in `tests/scenarios/secretary.mjs`.
* **Anti-loop Guard**: Suppresses auto-replies to other bots or non-addressed media notes to prevent loops.
* **Guest/Secretary Deduplication**: When a user explicitly mentions or replies to the bot in a business chat, Telegram sends **both** a `business_message` (secretary) and a `guest_message` (guest mode) for the same event. To prevent a double response, the bot suppresses the `business_message` path for explicit mentions — but only when it is certain that a `guest_message` will follow, i.e., when Guest Mode is enabled **both** in local settings and at the BotFather level (`supports_guest_queries`). If either side has Guest Mode disabled, the bot processes the `business_message` normally instead.
* **Telegram Business Connection Quirks & Permissions**: 
  - **Illogical Update Delivery**: Telegram continues to send `business_message` updates even if the business connection has been deactivated/revoked or if the owner has disabled secretary mode in the bot settings (due to queued/pending updates still hitting the webhook URL or propagation delays). If the bot tries to reply via such an inactive or restricted business connection, Telegram rejects the API call with a `BUSINESS_CONNECTION_NOT_ALLOWED` error.
  - **Owner Configuration Control**: Users can also inadvertently restrict the bot's right to reply on their behalf (e.g., toggling off "Can reply to messages" inside My Profile -> Chat Automation -> Bot Permissions -> Manage Messages).
  - **Graceful Mitigation**: To avoid failures, the bot fetches the connection status via `getBusinessConnection`. If the call fails (indicating a deleted, unauthorized, or disabled connection) or if `can_reply` is false, it logs a console warning and aborts message processing early with a `200 OK` webhook response. If a race condition occurs and a `BUSINESS_CONNECTION_NOT_ALLOWED` error is returned by Telegram during a reply, the error is classified as a user-space delivery error (handled in `isUserSpaceError`) to prevent spamming the owner's private chat with critical exception alerts.
* **Secretary Connection Scope Overlaps**: If multiple Telegram Business connections (whether using the same bot or different bots) overlap in shared chats or groups, they will receive updates for the same messages, leading to duplicate processing or competing replies. To resolve this, users must configure appropriate inclusion/exclusion rules under their respective Telegram client settings (Telegram Settings -> Telegram Business -> Business Bots / Chat Automation) to ensure that the scopes of different business connections do not overlap.
  * As a local workaround specifically when interlocutors are using the same instance of this bot, the bot caches the last processed `file_unique_id` in a module-scoped variable `lastProcessedBusinessFileUniqueId` to drop duplicates. This is a lightweight, single-instance workaround that does not synchronize across horizontal scaling.

*Verified in `tests/scenarios.mjs` (scenarios "Secretary mode explicit mention...").*



## Part III: Content Formatting & Constraints

### 10. Dynamic Transcription Pagination (Chunking)
Telegram enforces a 4096-character limit on message payloads. Transcriptions that exceed this limit are chunked dynamically:
* **Pre-formatting Splitting**: Splitting the raw transcription text *before* applying MarkdownV2 escaping and formatting prevents formatting elements (like `*`, `_`, ```) from being split across chunk boundaries, avoiding malformed entities that trigger Telegram API Bad Request errors.
* **Rendered Length Splitting**: Calculates the exact Markdown length of the header, verbose footer, and pagination digits, subtracts it from 4096, and chunks the transcription text to fit perfectly. It reserves a tiny 10-character buffer for the pagination digits, utilizing over 99.9% of the Telegram limit.
* **Single-Use Guest Query Guard**: For guest message replies, subsequent chunks must be sent as regular messages using the standard `sendMessage` method since `answerGuestQuery` is a one-time API action. If the guest hasn't started the bot in their private chat, subsequent `sendMessage` requests fail with `403 Forbidden`. The bot appends a warning footnote to the first chunk informing the guest how to retrieve full transcripts.
* **Self-Healing Fallbacks & Error Propagation**: If a message send fails due to formatting issues (`can't parse entities`), the bot falls back to retrying the message as plain text (deleting `parse_mode`).

*Verified in `tests/scenarios.mjs` (scenarios "Very long transcription splits...", "MarkdownV2 formatting error...", "Deleted voice message error...").*

---

### 11. Localization Mechanics & Multi-Language Support
The bot supports dynamic auto-detection of the owner's Telegram client language, falling back to a statically configured language if auto-detection is unavailable or the user's language is unsupported.

#### Bot UI Language & Fallback Keyboard Rationale:
* **Simultaneous Highlighting**: In the `/langbot` configuration menu, the "Auto-detect" checkmark button (✅/❌) and the selected fallback language radio star button (★) are highlighted **simultaneously**. This is intentional: the owner must always see the status of the auto-detection feature AND which specific language is designated as the fallback.
* **State Separation**: Selecting a specific language button changes the fallback language code (`settings.langbot`), but does NOT automatically disable the dynamic auto-detection flag (`settings.autodetect`), allowing both values to remain configured in the webhook URL query string.
* **Raw Language Code Display**: The "Auto-detect" button displays the raw, unnormalized language code exactly as it is received from Telegram (e.g., `en-US`, `es-ES`, `ru`) in parentheses (e.g., `✅ Auto-detect (en-US)`). This allows the owner to inspect exactly what language code Telegram sends.

---

### 12. File Size Limits & Platform Payloads
* **Telegram Bot API limit**: The standard cloud Telegram Bot API enforces a **20 MB** download limit per file.
* **Serverless incoming payload limits**: Hosts like Vercel (4.5 MB) and Netlify (6 MB) enforce strict payload limits on incoming webhook requests. However, these limits **do not** restrict outgoing HTTP `fetch` requests (such as downloading files from Telegram's servers or uploading to Groq). Therefore, the bot can fully process files up to the 20 MB Telegram limit.
* **Groq Whisper limit**: Cap is 25 MB.
* **Bypassing limits**: Processing files larger than 20 MB requires running a local Bot API server or using MTProto.

---

## Part IV: Operations & CI

### 13. "Other..." Buttons and the Menu Cache Fallback

Some settings (e.g., Whisper transcription language) offer far more choices than fit in an inline keyboard. For these, the menu includes an **"Other…"** button that uses Telegram's `switch_inline_query_current_chat` mechanism: clicking the button inserts a pre-filled command text (e.g., `/lang `) into the user's chat input field without sending a callback query to the server.

This creates a fundamental technical constraint:

> **When the user clicks an "Other…" button, the server receives no event.** The bot cannot update `LAST_MENU_MESSAGE` at that moment, and the cache entry for that chat may be stale or absent (especially on serverless platforms like Vercel, where in-memory state is lost between cold starts).

Consequently, when the user subsequently sends the typed command (e.g., `/lang ja`), the bot may not be able to locate the original menu message to edit it in place. The fallback in this case is to send a **new** menu message and delete the user's command message, keeping the chat clean.

#### What the Cache Is

`LAST_MENU_MESSAGE` is a plain in-memory `Map` stored at module scope (`chatId → messageId`). On serverless platforms, function instances are not necessarily destroyed after each request — the runtime freezes and reuses them for subsequent requests to reduce cold-start latency. This means the `Map` can survive across several consecutive requests on a warm instance.

However, this is **best-effort only**. If a new instance is cold-started (after a period of inactivity or under scale-out), the `Map` starts empty. The cache is therefore never relied upon as a guaranteed source of truth.

To mitigate staleness, the framework refreshes the cache eagerly: **every** ordinary button interaction (navigation, toggles, radio buttons) that reaches the server as a `callback_query` updates the entry for that chat. This maximizes the chance that a command typed immediately after a normal menu interaction will still find the correct message to update.

When the cache is cold or absent (e.g., after a Vercel cold start), the bot falls back to sending the menu as a **new message** and deletes the user's command message, keeping the chat clean.

---

### 14. Rate Limit Handling (429 Too Many Requests)
* **API Rate Limits**: Bursts of voice notes or fast keyboard settings toggling can trigger 429 errors.
* **Owner Alerts**: The generic framework retry/bypass boundaries are implemented in `callTelegram`. When a request is skipped due to a long rate limit, the bot fires a failure notification to the owner's chat to ensure transparent operational monitoring.

---

### 15. Fork Sync Workflow
A GitHub Actions workflow (`.github/workflows/sync.yml`) pulls upstream updates into forks weekly. The decision script (`scripts/ci_github_fork_sync.sh`) handles scenarios like fast-forward merges, local commits ahead, and diverged histories, emitting GitHub warning/error annotations.

*Verified by `tests/github_fork_sync.mjs`.*
