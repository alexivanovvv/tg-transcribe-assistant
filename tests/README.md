# Tests & Quality Assurance 🧪💻

This directory contains the automated test suite and QA verification tools for **Telegram Voice Transcribot**.

## 🏗️ Testing Principles & Infrastructure

Our testing strategy prioritizes **fast feedback loops**, **zero external dependencies**, and **100% local execution**.

- **Standard Library Test Runner (`node:test`)**: All unit and scenario test files are written using Node.js native `node:test` framework (Node.js 18+). They run zero-dependency and fast.
- **Cross-Runtime Compatibility**: All test suites are 100% compatible with both **Node.js** (`npm test`) and **Deno** (`deno task test`).
- **Isolation & Clean State**: Global mocks and test histories (such as `clearHistory()` and `clearBotInfoCache()`) are automatically reset using `afterEach` hooks to guarantee test isolation.
- **Mocked Telegram API**: Custom payload generators and `fetch` mocks simulate Telegram API responses and webhooks (Groups, Secretary, Guest modes) entirely locally without network calls.

---

## 🛡️ Part 1: Running the Test Suites

### 🚀 Global Test Suite
To run all linting checks and test suites in a single command:

* **Node.js**:
  ```bash
  npm test
  ```
* **Deno**:
  ```bash
  deno task test
  ```

### 🎯 Running Specific Test Categories

You can run individual test categories using `npm run` or `deno task`:

| Category | Command (Node) | Command (Deno) | Description |
|---|---|---|---|
| **Scenarios** | `npm run test:scenarios` | `deno task test:scenarios` | 67 scenario integration tests (`tests/scenarios/*.mjs`) |
| **Bot Unit** | `npm run test:bot` | `deno task test:bot` | 15 bot-specific unit tests (`tests/bot/*.mjs`) |
| **Framework Unit** | `npm run test:framework` | `deno task test:framework` | 34 generic framework tests (`tests/framework/*.mjs`) |
| **Localization** | `npm run test:localization` | `deno task test:localization` | Translation dictionary key alignment check |

---


## 📊 Code Coverage

Calculates test coverage across all scenario and unit test files:

* **Node.js**:
  ```bash
  npm run coverage
  ```
* **Deno**:
  ```bash
  deno task coverage
  ```

---

## 🌐 Part 2: Remote & Local Integration Server Verification

### Remote Integration Test (`npm run test:remote`)
Used to run live checks against deployed endpoints (Vercel, Cloudflare Workers, Netlify, Deno, Val Town) or a local development server.

* **Against Live Deployments**:
  ```bash
  npm run test:remote -- vercel=https://mybot.vercel.app cloudflare=https://mybot.workers.dev
  ```
* **Against Local Development Server**:
  ```bash
  npm run test:remote -- local=http://localhost:3000
  ```

---

## 💻 Part 3: Local Development & Debugging Utilities

### 1. Local Dev Server (`npm run dev` / `deno task dev`)
Emulates serverless HTTP requests locally:
* **Node.js**: `npm run dev` (or `node scripts/dev_node_server.js`)
* **Deno**: `deno task dev`
* **Local Endpoints**:
  - Web Dashboard: `http://localhost:3000/`
  - Webhook Endpoint: `http://localhost:3000/api/webhook`
  - Health Check Status: `http://localhost:3000/api/health`

### 2. Payload Generator (`npm run test:payload`)
Outputs sample Telegram webhook JSON payloads and `curl` command templates for testing:
* **Node.js**: `npm run test:payload`
* **Deno**: `deno task test:payload`

### 3. Direct Audio Transcription (`scripts/ops_transcribe.sh`)
Directly sends an audio file to Groq Whisper API bypassing Telegram:
```bash
./scripts/ops_transcribe.sh path/to/audio.ogg
```

### 4. Groq Early 401 Response Verification (`tests/test_groq_hang.js`)
Verification script used to diagnose whether HTTP POST with `FormData` stalls on early HTTP 401 Unauthorized responses from Groq API in specific runtimes:
```bash
node tests/test_groq_hang.js
# or
deno run --allow-net tests/test_groq_hang.js
```
