import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  configureLocalization,
  hasTranslation,
  getUserLang,
  getTranslation,
  getMarkdown
} from '../../lib/framework/localize.js';

const mockDict = {
  en: {
    welcome: "Welcome, {name}!",
    botVersion: "Version: `{val}`",
    simple: "Simple text. No tags.",
    boldText: "*Bold {val}*",
    linkText: "[Link]({url})"
  },
  ru: {
    welcome: "Добро пожаловать, {name}!",
    simple: "Простой текст."
  }
};

// Configure once for the suite (pure setup, no side effects on other suites)
configureLocalization(mockDict);

describe('Framework unit_localize', () => {

  test('hasTranslation', () => {
    assert.equal(hasTranslation('en'), true);
    assert.equal(hasTranslation('ru'), true);
    assert.equal(hasTranslation('fr'), false);
    assert.equal(hasTranslation('en-US'), true);
    assert.equal(hasTranslation(null), false);
  });

  test('getUserLang', () => {
    assert.equal(getUserLang({ autodetect: true }, 'ru-RU'), 'ru-RU');
    assert.equal(getUserLang({ autodetect: true }, 'fr-FR'), 'en'); // fallback because fr has no translation
    assert.equal(getUserLang({ autodetect: false, langbot: 'ru' }, 'en-US'), 'ru');
    assert.equal(getUserLang({}, 'ru'), 'ru');
  });

  test('getTranslation', () => {
    assert.equal(getTranslation('en', 'simple'), 'Simple text. No tags.');
    assert.equal(getTranslation('ru', 'simple'), 'Простой текст.');
    assert.equal(getTranslation('ru', 'welcome', { name: 'Иван' }), 'Добро пожаловать, Иван!');
  });

  test('context-aware getMarkdown escaping', () => {
    // In plain text: dots/dashes/exclamations escaped
    const pResult = getMarkdown('en', 'welcome', { name: 'John-Doe.123' });
    assert.equal(pResult, 'Welcome, John\\-Doe\\.123\\!');

    // Inside code segment: dots/dashes NOT escaped, backticks/backslashes escaped
    const cResult = getTranslation('en', 'botVersion', { val: 'v1.0-beta.2`x`\\' });
    assert.equal(cResult, 'Version: `v1.0-beta.2\\`x\\`\\\\`');
  });
});
