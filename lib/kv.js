// lib/kv.js
// Small JSON key-value store: Netlify Blobs when running on Netlify, process memory otherwise
// (tests, local dev, other platforms). Used for reply-option state and the speech-to-text keyterms.

const memory = new Map();
let backend = null;

/**
 * Netlify Lambda-style functions must hand the event to Blobs before getStore() works.
 */
export async function connectNetlifyKv(event) {
  try {
    const { connectLambda, getStore } = await import('@netlify/blobs');
    connectLambda(event);
    const store = getStore('ponch');
    backend = {
      get: (key) => store.get(key, { type: 'json' }),
      set: (key, value) => store.setJSON(key, value)
    };
  } catch (e) {
    console.warn('[KV] Netlify Blobs unavailable, using memory:', e.message);
  }
}

export function setKvBackend(custom) {
  backend = custom;
}

export async function kvGet(key) {
  if (backend) {
    try {
      return (await backend.get(key)) ?? null;
    } catch (e) {
      console.error(`[KV] get ${key} failed:`, e.message);
      return null;
    }
  }
  return memory.has(key) ? structuredClone(memory.get(key)) : null;
}

export async function kvSet(key, value) {
  if (backend) {
    try {
      await backend.set(key, value);
      return true;
    } catch (e) {
      console.error(`[KV] set ${key} failed:`, e.message);
      return false;
    }
  }
  memory.set(key, structuredClone(value));
  return true;
}
