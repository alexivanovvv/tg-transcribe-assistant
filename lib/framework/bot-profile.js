// lib/framework/bot-profile.js
// Generic bot profile and avatar management helpers

import { syncBotCommands } from './router.js';
import { syncBotMetadata } from './utils.js';

export async function setupBotProfile(token, options = {}) {
  const {
    getTranslation = (_lang, key) => key,
    getTranslations = () => ({}),
    getSettings = async () => ({}),
    languages = ['', 'en', 'ru', 'de', 'uk']
  } = options;

  const settings = await getSettings(token);
  const ownerChatId = settings.owner;
  const translations = getTranslations();

  for (const lang of languages) {
    const translationLang = lang || 'en';

    await syncBotCommands(token, ownerChatId, lang, getTranslation);

    const botName = translations[translationLang]?.botName;
    const botDescription = translations[translationLang]?.botDescription;
    const botShortDescription = translations[translationLang]?.botShortDescription;

    await syncBotMetadata(token, lang, botName, botDescription, botShortDescription);
  }
  console.log('Bot profile automated configuration completed.');
}

/**
 * Try to upload bot profile photo from local files (avatar.jpg, avatar.png, avatar.jpeg)
 * if they exist in the root of the project.
 */
export async function setupBotAvatar(token) {
  try {
    let fileData = null;
    let fileName = '';

    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
      const possiblePaths = [
        path.join(cwd, 'avatar.jpg'),
        path.join(cwd, 'avatar.png'),
        path.join(cwd, 'avatar.jpeg')
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          fileData = fs.readFileSync(p);
          fileName = path.basename(p);
          break;
        }
      }
    } catch {
      // Ignore if filesystem is unavailable (e.g. Cloudflare Workers)
    }

    if (!fileData) {
      console.log('No avatar file (avatar.jpg/png/jpeg) found in project root. Skipping bot profile photo setup.');
      return;
    }

    console.log(`Found avatar file: ${fileName}. Uploading to Telegram...`);
    const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const blob = new Blob([fileData], { type: mimeType });
    const formData = new FormData();
    formData.append('photo', blob, fileName);

    const res = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, {
      method: 'POST',
      body: formData
    });
    const resData = await res.json();
    if (resData.ok) {
      console.log('Bot profile photo updated successfully.');
    } else {
      console.error('Failed to set bot profile photo:', resData.description);
    }
  } catch (err) {
    console.error('Error in setupBotAvatar:', err);
  }
}
