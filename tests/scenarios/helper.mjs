import crypto from 'node:crypto';

export const MOCK_TOKEN = '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
export const MOCK_CONFIG = {
  telegramBotToken: MOCK_TOKEN,
  whisperApiKey: 'mock_whisper_key',
  whisperApiBase: 'https://api.groq.com/openai/v1',
  ownerChatId: '12345'
};

export const mockSecretToken = crypto.createHash('sha256').update(MOCK_TOKEN).digest('hex');

export const MOCK_CTX = {
  waitUntil: (promise) => promise // Execute synchronously in tests
};

export function createReq(body, query = {}) {
  return {
    headers: { 'x-telegram-bot-api-secret-token': mockSecretToken },
    body,
    query
  };
}

export const recordedCalls = [];

export function clearHistory() {
  recordedCalls.length = 0;
}

let originalFetch = globalThis.fetch;

export function setupFetchMock() {
  originalFetch = globalThis.fetch;
  
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const body = options.body ? (typeof options.body === 'string' ? options.body : '[FormData/Blob]') : null;
    
    const callRecord = {
      url: urlStr,
      method: options.method || 'GET',
      headers: options.headers || {},
      body
    };
    
    if (options.body && typeof options.body.get === 'function') {
      callRecord.formData = {
        model: options.body.get('model'),
        language: options.body.get('language'),
        prompt: options.body.get('prompt'),
        file: options.body.get('file')
      };
    }
    
    // Try to parse JSON body if possible
    if (body && body !== '[FormData/Blob]') {
      try {
        callRecord.json = JSON.parse(body);
      } catch { /* ignore */ }
    }
    
    recordedCalls.push(callRecord);

    // Return mocked responses based on URL match
    if (urlStr.includes('/getWebhookInfo')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            url: 'https://example.com/api/webhook?owner=12345',
            allowed_updates: ['message', 'business_message', 'guest_message', 'my_chat_member']
          }
        })
      };
    }
    if (urlStr.includes('/getFile')) {
      let filePath = 'voice/mock_file.ogg';
      if (body) {
        try {
          const parsed = JSON.parse(body);
          if (parsed.file_id === 'flac_file_id') {
            filePath = 'documents/music.flac';
          } else if (parsed.file_id === 'mov_file_id') {
            filePath = 'documents/video.mov';
          } else if (parsed.file_id === 'mp4_file_id') {
            filePath = 'videos/video.mp4';
          } else if (parsed.file_id === 'opus_file_id') {
            filePath = 'documents/audio.opus';
          }
        } catch { /* ignore */ }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { file_path: filePath } })
      };
    }
    if (urlStr.includes('/file/bot') || urlStr.includes('/voice/mock_file.ogg')) {
      // Return dummy empty file buffer
      const dummyOgg = new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]); // "OggS" header
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => dummyOgg.buffer
      };
    }
    if (urlStr.includes('/audio/transcriptions')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: 'This is a mock voice transcription.' }),
        text: async () => JSON.stringify({ text: 'This is a mock voice transcription.' })
      };
    }

    if (urlStr.includes('/getMe')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: 999999, first_name: 'Transcribot', username: 'tg_transcribot' } })
      };
    }

    if (urlStr.includes('/getBusinessConnection')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            id: 'conn_123',
            user: { id: 11111, first_name: 'Client' },
            user_chat_id: 11111,
            is_enabled: true,
            can_reply: true
          }
        })
      };
    }

    // Fallback default response
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: {} })
    };
  };
}

export function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Helper to check if a Telegram message was sent with specific text contains
export function assertMessageSent(chatId, pattern) {
  const sent = recordedCalls.find(call => {
    if (call.url.includes('/sendMessage')) {
      return String(call.json?.chat_id) === String(chatId) &&
        (pattern instanceof RegExp ? pattern.test(call.json?.text) : call.json?.text.includes(pattern));
    }
    if (call.url.includes('/sendRichMessage')) {
      const text = call.json?.rich_message?.markdown || call.json?.rich_message?.html || '';
      return String(call.json?.chat_id) === String(chatId) &&
        (pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern));
    }
    return false;
  });
  if (!sent) {
    throw new Error(`Expected message to chat ${chatId} containing "${pattern}" was NOT sent. Recorded calls: ${JSON.stringify(recordedCalls, null, 2)}`);
  }
}

export function assertNoMessageSent() {
  const sent = recordedCalls.find(call => call.url.includes('/sendMessage'));
  if (sent) {
    throw new Error(`Expected NO messages to be sent, but found a sendMessage call: ${JSON.stringify(sent, null, 2)}`);
  }
}
