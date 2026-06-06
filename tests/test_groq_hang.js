// tests/test_groq_hang.js
// Verification script to check if fetch POST with FormData hangs on early 401 response from Groq API.
// Run this script in your target environment (Node.js or Deno).

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const INVALID_KEY = 'gsk_invalid_key_test_12345';

async function testPost() {
  console.log('1. Starting POST request with FormData (1MB body) and invalid API key...');
  const start = Date.now();
  
  const formData = new FormData();
  // Create a 1MB dummy array of bytes
  const dummyData = new Uint8Array(1 * 1024 * 1024);
  const fileBlob = new Blob([dummyData], { type: 'audio/wav' });
  formData.append('file', fileBlob, 'audio.wav');
  formData.append('model', 'whisper-large-v3');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`[POST] Stalled! Aborting after 5 seconds...`);
    controller.abort();
  }, 5000);

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${INVALID_KEY}` },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    console.log(`[POST] Resolved! Status: ${res.status} (${res.statusText}) in ${((Date.now() - start)/1000).toFixed(1)}s`);
    const text = await res.text();
    console.log('Response body:', text);
  } catch (err) {
    clearTimeout(timeoutId);
    console.log(`[POST] Failed! Error: ${err.message} in ${((Date.now() - start)/1000).toFixed(1)}s`);
  }
}

async function testGet() {
  console.log('\n2. Starting GET request with invalid API key (no body)...');
  const start = Date.now();

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${INVALID_KEY}` }
    });
    console.log(`[GET] Resolved! Status: ${res.status} (${res.statusText}) in ${((Date.now() - start)/1000).toFixed(1)}s`);
  } catch (err) {
    console.log(`[GET] Failed! Error: ${err.message} in ${((Date.now() - start)/1000).toFixed(1)}s`);
  }
}

async function run() {
  console.log(`Running on Environment: ${typeof Deno !== 'undefined' ? 'Deno' : 'Node.js ' + process.version}`);
  await testGet();
  await testPost();
}

run();
