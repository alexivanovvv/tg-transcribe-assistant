// lib/framework/settings.js
// Generic webhook settings serialization helpers

/**
 * Parse query params from Telegram webhook URL or a raw URL string.
 */
export function parseWebhookQuery(webhookInfoOrUrl) {
  const urlStr = typeof webhookInfoOrUrl === 'string'
    ? webhookInfoOrUrl
    : (webhookInfoOrUrl?.url || '');
  const query = {};

  try {
    if (urlStr.includes('?')) {
      const parts = urlStr.split('?');
      const searchParams = new URLSearchParams(parts[1]);
      searchParams.forEach((val, key) => {
        query[key] = val;
      });
    }
  } catch (e) {
    console.error('Error parsing webhook URL query params:', e);
  }

  return query;
}

/**
 * Build webhook URL from base URL, route path and query dictionary.
 */
export function buildWebhookUrl(baseUrl, routePath, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;
  const queryStr = params.toString();
  return `${cleanBase}${cleanRoute}${queryStr ? '?' + queryStr : ''}`;
}

/**
 * Build allowed_updates list from a base set and optional feature toggles.
 */
export function buildAllowedUpdates(baseUpdates, featureToggles = []) {
  const result = [...baseUpdates];
  for (const feature of featureToggles) {
    if (feature?.enabled && Array.isArray(feature.updates)) {
      for (const updateType of feature.updates) {
        if (!result.includes(updateType)) {
          result.push(updateType);
        }
      }
    }
  }
  return result;
}
