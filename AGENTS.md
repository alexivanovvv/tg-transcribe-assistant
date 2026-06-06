# AGENTS: Agent Instructions & Mandatory Rules

This document outlines strict requirements for AI agents working on the **Telegram Voice Transcribot** codebase. 

### Purpose of this Document
This file serves as a quick overview map and a strict rulebook for AI agents. 
While it contains a high-level map of the directory structure to help agents navigate quickly, **it MUST NOT contain primary documentation of technical behavior** (such as edge-cases, procedural flows, or architectural reasoning). All behavioral and technical documentation must be kept in appropriate places (`README.md`, `DEVNOTES.md`, `tests/README.md`, or automated tests).

---

## Project Directory Structure

```
├── api/
│   ├── setup.js         # Endpoint to configure/set up Telegram webhook URL
│   └── webhook.js       # Main Telegram update and webhook handler
├── lib/
│   ├── framework/
│   │   ├── README.md            # Documentation for the generic framework
│   │   ├── adapters.js          # Generic platform request adapters (Vercel, Netlify, Web Request)
│   │   ├── bot-profile.js       # Generic Telegram profile metadata and avatar helpers
│   │   ├── dashboard.js         # Generic admin settings and webhook setup web page
│   │   ├── localize.js          # Core framework localization setup
│   │   ├── markdown.js          # Generic HTML to MarkdownV2 and symbols escaper
│   │   ├── menu.js              # Generic menu engine and callback queries handler
│   │   ├── reply.js             # Generic Telegram reply payload builder
│   │   ├── router.js            # Generic command and HTTP routes registry and dispatcher
│   │   ├── setup.js             # Generic webhook setup endpoint handler factory
│   │   ├── utils.js             # Generic crypto, hash, and header helper utilities
│   │   └── webhook.js           # Generic webhook verification, deduplication, and update dispatch
│   ├── wav-wrapper.js   # Utility to detect and wrap ADTS-AAC, CAF, AMR, GSM into WAV container
│   ├── commands.js      # Interactive commands and settings management
│   ├── core.js          # Core update handling and webhook business logic
│   ├── transcriber.js   # Audio downloading and Whisper API orchestration
│   ├── dashboard.js     # Web dashboard / landing page configuration and webhook setup
│   ├── localize.js      # Multi-language translation dictionaries (en, ru, de, ukr)
│   ├── menus.js         # Specific bot menu definitions and settings mappings
│   ├── package.json     # Local library package configuration to enable ESM
│   ├── utils.js         # Transcription text chunking, Whisper token estimation, and re-exports
│   └── webhook-settings.js # Helper functions to parse and build webhook query-string configurations
├── netlify/
│   └── functions/
│       ├── setup.js     # Netlify setup function
│       └── webhook.js   # Netlify webhook function
├── src/
│   ├── deno.js          # Deno Deploy & Val Town entry point
│   └── index.js         # Cloudflare Workers entry point
├── scripts/
│   ├── ci_github_fork_sync.sh   # Pure decision logic for the GitHub fork sync workflow
│   ├── debug_mode_disabled.mjs  # Helper script to debug disabled groups mode callback locally
│   ├── dev_node_server.js       # Local HTTP dev server simulating serverless runtime
│   ├── dev_test_webhook.js      # Helper payload generator to test the webhook locally
│   ├── ops_set_avatar.js        # Script to manually configure the bot profile photo/metadata
│   ├── ops_set_webhook.js       # Script to manually configure the bot webhook via API
│   └── ops_transcribe.sh        # Direct audio transcription CLI helper tool
├── tests/
│   ├── bot/                     # Bot-specific unit and validation tests
│   │   ├── cf_worker_runner.mjs # Isolated runner helper for Cloudflare entrypoint test
│   │   ├── unit_routing.mjs     # Commands routing unit tests
│   │   ├── unit_utils.mjs       # Bot utilities unit tests
│   │   └── unit_webhook.mjs     # Webhook payload parsing and configuration tests
│   ├── framework/               # Framework core unit and validation tests
│   │   ├── unit_localize.mjs    # Multi-language localization framework tests
│   │   ├── unit_markdown.mjs    # HTML/Markdown conversion and symbol escaping tests
│   │   ├── unit_menu.mjs        # Callback query-driven menu engine tests
│   │   ├── unit_router.mjs      # Framework router and route dispatcher tests
│   │   ├── unit_utils.mjs       # Cryptographic and hashing utilities tests
│   │   └── unit_webhook.mjs     # Webhook request signature and verification tests
│   ├── scenarios/               # Refactored scenario-based integration test suites
│   │   ├── core.mjs             # Basic updates routing and dynamic owner registration tests
│   │   ├── helper.mjs           # Shared testing helpers, API mocks, and assertions
│   │   ├── media.mjs            # Media formats, prompt overrides, transcription chunks, and errors tests
│   │   ├── secretary.mjs        # Business/Secretary mode routing, mentions, and deduplication tests
│   │   └── settings.mjs         # Dashboard setups, config commands, and callback menu updates tests
│   ├── github_fork_sync.mjs     # Tests all 5 fork sync scenarios without a live git repo
│   ├── localization.mjs         # Validates key alignment and scans for unused keys
│   ├── README.md                # QA principles, node:test runner usage, and debugging guides
│   ├── remote.js                # Verifies deployment integration and webhooks
│   ├── test_groq_hang.js        # Verification script to check early 401 response FormData handling
│   └── whitebox_helper.mjs      # Test assertion and setup helper utilities
├── wrangler.jsonc       # Cloudflare Wrangler configuration
├── netlify.toml         # Netlify configuration
├── deno.json            # Deno configuration (defines deploy entrypoint)
├── DEVNOTES.md          # Technical notes regarding AAC processing and patches
├── README.md            # User-facing project overview, setup, and deployment guides
├── FORMATS.md           # Summary of supported media audio formats and wrapping strategies
├── IDEAS*.md            # Ideas and feature requests for various subsystems
├── vercel.json          # Vercel configuration & routing rules
├── eslint.config.js     # ESLint configuration rules
├── package.json         # Project manifests and scripts
└── PLAN*.md             # Any temporary local work plan roadmaps (ignored by Git)
```

---

## General Agent Guidelines

### Preliminary Planning Requirement
* Before making any code changes, creating new files, or invoking modification commands, the agent **MUST** formulate a structured plan.
* **Insufficient Data block:** If the agent lacks the necessary tokens, environment configs, system information, or documentation, and is unable to acquire them autonomously, the agent **MUST NOT** proceed or make assumptions. It must immediately halt execution, report what is missing, and ask the user to decide on the next steps.
* If the user provides unclear commands, ambiguous instructions, or contradictory requests, the agent **MUST** immediately stop execution, refrain from making arbitrary assumptions, and request clarification from the user before proceeding.

### Git Safety and Clean State Requirement
* Before initiating any potentially destructive, bulk, or recovery operations (such as restoring files from backups, resetting git branches, running file recovery scripts, or performing massive file rewrites), the agent **MUST** check the git status.
* If there are uncommitted local changes, the agent **MUST NOT** proceed with destructive commands until those changes are either committed, stashed, or the user has explicitly confirmed and approved overwriting the uncommitted files.
* When applying edits to files that already contain uncommitted modifications, the agent **MUST** inspect the `git diff` of those files first. You must ensure that new logic or dictionary keys are merged cleanly on top of the user's modifications without creating duplicates, syntax errors, or discarding custom user work.

### Mandatory Code Verification
* After making modifications to the executable codebase (JavaScript, JSON, config files, etc.) or performing a deployment, the agent **MUST** execute local and/or remote integration tests.
* If only documentation, markdown files (such as `.md`), or non-executable files were modified without any changes to the code or configurations, the agent **MUST** obsolete the requirement to run the test suite.
* When code changes are present, the agent **MUST** run the test runner script (local and remote).


## Tooling & Context Retrieval

### Preferred Tools & Shell Usage
* The agent **MUST** prioritize using available built-in tools (such as `view_file` to read, `list_dir` to list files, `grep_search` to search, and `write_to_file`/`replace_file_content`/`multi_replace_file_content` to create or modify files) instead of executing external terminal commands (`cat`, `ls`/`dir`, `grep`, `echo`, `sed`, `awk`, etc.) via `run_command` in a shell, unless there is no built-in tool capable of performing the specific action.
* Prefer using standard platform/built-in shell commands directly (e.g., `node test_server.js`, `curl.exe`, `npm run ...`) instead of creating or wrapping commands in custom shell scripts (`.sh` or `.ps1` files) unless explicitly asked to do so by the user.

### Context7 Documentation Queries
* If the user instructions or rules require using the `context7` skill to query documentation, the agent **MUST** use the CLI utility directly via terminal commands (e.g. `npx ctx7@latest library ...` and `npx ctx7@latest docs ...`). 
* Do not rely on Context7 MCP server tools (`resolve-library-id` or `query-docs`) as they might not be connected or available.

**Resolved Library IDs (skip `library` lookup, use directly):**
| Library | Context7 ID |
| :--- | :--- |
| Telegram Bot API (official) | `/websites/core_telegram_bots_api` |

### Proactive Knowledge Preservation in Skills
* If the agent searches for, extracts, or discovers undocumented API schemas, formatting rules, or implementation patterns (such as those from external documentation or web searches), the agent **MUST** proactively suggest creating a new global/local skill or adding a `references/` subdirectory with this information to preserve knowledge for future agent sessions.


## Architecture & System Rules

### Framework Dependency Boundary
* `lib/framework/` contains reusable Telegram and serverless infrastructure only.
* Framework modules **MUST NOT** import bot-layer modules such as `lib/localize.js`, `lib/webhook-settings.js`, `lib/commands.js`, or `lib/menus.js`.
* Bot-specific settings parsing, webhook serialization, translation data, settings access, and post-setup behavior **MUST** be passed into framework factories/configuration APIs.
* Behavioral details of framework contracts belong in `lib/framework/README.md` and `tests/framework/`; this file only records the boundary rule.

### Deno and NPM Script Synchronization
* The project supports both Deno and Node.js runtimes.
* If the agent modifies, adds, or removes any NPM script within `package.json`, the agent **MUST** immediately update and synchronize the corresponding Deno task inside `deno.json`.


## Documentation Rules

### English Documentation and Code Language
* **Code & Comments:** All code, inline comments, variable names, and terminal logs **MUST** be written in **English**.
* **Repository Documentation:** All key markdown documents representing the repository state (`README.md`, `tests/README.md`, `DEVNOTES.md`, `AGENTS.md`) **MUST** be written in **English**.
* **Exception:** The `PLAN.md` file (or `implementation_plan.md` artifact) is a transient workspace roadmap and may be written in any language (including Russian), as it is not meant to be persisted or committed into the repository history.

### Permission for Documented Behavior Changes
* Before changing any behavior that is explicitly and strictly regulated in the project documentation (such as `DEVNOTES.md`, `tests/README.md`, or `AGENTS.md`), the agent **MUST** explicitly request the user's permission to do so.

### Documentation Sync
* After making any code changes, the agent **MUST** ensure they match the existing repository documentation. If code modifications impact configurations, setup steps, platform routing, or API behaviors, the agent **MUST** update, correct, or expand the documentation accordingly.

### Single Source of Truth for Behavior
* When updating documentation, agents **MUST** ensure that `DEVNOTES.md` answers the question "WHY" a specific technical decision was made, rather than "HOW EXACTLY" it is implemented.
* Explicit procedural details and behavioral edge-cases **MUST** be covered directly by the automated test suite (e.g. `tests/scenarios/*.mjs`, `tests/framework/*.mjs`).
* The documentation should simply reference those tests to avoid creating a duplicate, out-of-sync source of truth.

### Clean User-Facing Feature Highlights (README)
* When editing user-facing files like `README.md`, keep feature lists and high-level descriptions strictly focused on core capabilities.
* Do **NOT** clutter these user-facing bullet points with optional settings, environment variables (e.g. `WHISPER_PROMPT`), or command options (e.g. phrases beginning with "Optionally..."). Keep configuration and setup details in technical developer documentation (such as `DEVNOTES.md` or a "Configuration" section).
