// tests/bot/cf_worker_runner.mjs
// Isolated runner to test Cloudflare Workers entrypoint without global process object.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

// Verify worker compatibility by removing global process object
globalThis.process = undefined;

globalThis.fetch = async (url) => {
  const urlStr = url.toString();
  if (urlStr.includes('/getMe')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { username: 'testbot' } }), text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }), text: async () => '' };
};

const entryPath = path.join(rootDir, 'src', 'index.js');
const tempEntryPath = path.join(rootDir, 'src', 'index_temp.test.js');

let source = await fs.readFile(entryPath, 'utf8');
source = source.replace("import pkg from '../package.json';", "const pkg = { version: '0.1.0' };");

await fs.writeFile(tempEntryPath, source, 'utf8');

try {
  const { default: worker } = await import(pathToFileURL(tempEntryPath).href);
  const response = await worker.fetch(
    new Request('https://telegram-transcribot.example.workers.dev/'),
    {
      TELEGRAM_BOT_TOKEN: '111222333:AABBccDDeeffGGHHiijjKK',
      WHISPER_API_KEY: 'mock_whisper_key'
    },
    {}
  );
  const body = await response.text();
  console.log('__RESULT__' + JSON.stringify({ status: response.status, bodyStart: body.slice(0, 120) }));
} finally {
  await fs.unlink(tempEntryPath);
}
