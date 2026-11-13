// netlify/functions/webhook.js
// Netlify Function adapter for webhook updates

const pkg = require('../../package.json');

// Telegram updates (POST) go to the background function and get an instant 200; if it is unavailable,
// the update is processed inline as before. GET (dashboard, health check) is always handled here.
async function forwardToBackground(event) {
  if (event.httpMethod !== 'POST' || !process.env.URL || process.env.NETLIFY_DEV) return false;
  try {
    const query = new URLSearchParams(event.queryStringParameters || {}).toString();
    const headers = { ...event.headers, 'x-original-path': event.path || '/' };
    delete headers.host;
    delete headers['content-length'];
    const res = await fetch(`${process.env.URL}/.netlify/functions/webhook-background${query ? `?${query}` : ''}`, {
      method: 'POST',
      headers,
      body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : event.body,
      signal: AbortSignal.timeout(3000)
    });
    if (res.status === 202) return true;
    console.warn(`[Background] forward returned ${res.status}, processing inline`);
  } catch (e) {
    console.warn('[Background] forward failed, processing inline:', e.message);
  }
  return false;
}

exports.handler = async function(event, context) {
  if (await forwardToBackground(event)) return { statusCode: 200, body: 'OK' };
  await import('../../lib/core.js'); // registers HTTP routes and config builder via side-effects
  const { connectNetlifyKv } = await import('../../lib/kv.js');
  await connectNetlifyKv(event);
  const { handleNetlifyRequest } = await import('../../lib/framework/adapters.js');
  return handleNetlifyRequest(event, context, { BOT_VERSION: pkg.version });
};
