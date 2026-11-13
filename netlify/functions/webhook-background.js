// netlify/functions/webhook-background.js
// Background twin of the webhook function: Netlify answers 202 at once and lets it run up to 15 minutes,
// so long voices are never cut by the 10 s limit. Fed by netlify/functions/webhook.js.

const pkg = require('../../package.json');

exports.handler = async function(event, context) {
  // The forwarder passes the original path (routes are matched on it)
  event.path = event.headers['x-original-path'] || '/';
  await import('../../lib/core.js'); // registers HTTP routes and config builder via side-effects
  const { connectNetlifyKv } = await import('../../lib/kv.js');
  await connectNetlifyKv(event);
  const { handleNetlifyRequest } = await import('../../lib/framework/adapters.js');
  await handleNetlifyRequest(event, context, { BOT_VERSION: pkg.version, BOT_BACKGROUND: '1' });
};
