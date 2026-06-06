import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBtn,
  makeRadioBtn,
  makeCheckboxBtn,
  registerMenu,
  renderMenuKeyboard,
  handleCallbackQuery,
  configureMenuFramework
} from '../../lib/framework/menu.js';
import { installMockFetch, restoreFetch, recordedCalls, mkJson, MOCK_CONFIG } from '../whitebox_helper.mjs';

configureMenuFramework({
  loadSettings: async () => ({ testOpt: true, model: 'turbo' }),
  saveSettings: async () => ({ ok: true }),
  getUserLang: () => 'en',
  getTranslation: (lang, key) => {
    const d = { btnBack: '« Back', btnClose: 'Close', btnMain: 'Main' };
    return d[key] || key;
  }
});

registerMenu('main_test', {
  isMain: true,
  getTitle: () => 'Main Test Menu',
  getText: () => 'Testing text...',
  getButtons: () => [
    [ { type: 'action', text: 'Click Me', action: 'click', value: '1' } ],
    [ { type: 'menu', text: 'Go Sub', menuId: 'sub_test' } ]
  ]
});

registerMenu('sub_test', {
  getTitle: () => 'Sub Test Menu',
  getButtons: (settings) => [
    [ { type: 'toggle', text: 'Opt', action: 'toggle', value: 'testOpt', isChecked: settings.testOpt } ]
  ]
});

describe('Framework unit_menu', () => {
  afterEach(() => restoreFetch());

  test('Button decorators', () => {
    const btn = makeBtn('Click', 'action:click', false);
    assert.equal(btn.text, 'Click');
    assert.equal(btn.callback_data, 'action:click');
    assert.equal(btn.style, undefined);

    const activeBtn = makeBtn('Click', 'action:click', true);
    assert.equal(activeBtn.style, 'primary');

    const dangerBtn = makeBtn('Click', 'action:click', false, true);
    assert.equal(dangerBtn.style, 'danger');

    const cbOn = makeCheckboxBtn('Toggle', true, 'action:toggle');
    assert.equal(cbOn.text, '✅ Toggle');
    const cbOff = makeCheckboxBtn('Toggle', false, 'action:toggle');
    assert.equal(cbOff.text, '❌ Toggle');

    const radioOn = makeRadioBtn('Option', 'val1', 'val1', 'action:radio');
    assert.equal(radioOn.text, '★ Option');
  });

  test('Menu registry and keyboard rendering', async () => {
    const settings = { testOpt: true };
    const kb = renderMenuKeyboard('main_test', settings, 'en', {}, null);

    assert.equal(kb.inline_keyboard.length, 3);
    assert.equal(kb.inline_keyboard[0][0].text, 'Click Me');
    assert.equal(kb.inline_keyboard[1][0].text, 'Go Sub');

    const navRow = kb.inline_keyboard[2];
    assert.equal(navRow[0].text, 'Close');
    assert.equal(navRow[0].callback_data, 'nav:close');
  });

  test('Callback queries — nav:close deletes message', async () => {
    installMockFetch({
      '/deleteMessage': () => mkJson({ ok: true, result: true }),
      '/answerCallbackQuery': () => mkJson({ ok: true, result: true }),
      '/editMessageText': () => mkJson({ ok: true, result: { message_id: 101 } }),
      '/sendMessage': () => mkJson({ ok: true, result: { message_id: 102 } })
    });
    recordedCalls.length = 0;

    await handleCallbackQuery({
      id: 'cb_123',
      from: { id: 99999 },
      message: { chat: { id: 99999, type: 'private' }, message_id: 101 },
      data: 'nav:close'
    }, MOCK_CONFIG, 'https://test.com');

    const deleteCall = recordedCalls.find(c => c.url.includes('/deleteMessage'));
    assert.ok(deleteCall);
    assert.equal(deleteCall.json.message_id, 101);
  });

  test('Callback queries — nav:sub_test edits to sub menu', async () => {
    installMockFetch({
      '/deleteMessage': () => mkJson({ ok: true, result: true }),
      '/answerCallbackQuery': () => mkJson({ ok: true, result: true }),
      '/editMessageText': () => mkJson({ ok: true, result: { message_id: 101 } }),
      '/sendMessage': () => mkJson({ ok: true, result: { message_id: 102 } })
    });
    recordedCalls.length = 0;

    await handleCallbackQuery({
      id: 'cb_124',
      from: { id: 99999 },
      message: { chat: { id: 99999, type: 'private' }, message_id: 101, reply_markup: { inline_keyboard: [] } },
      data: 'nav:sub_test:main_test'
    }, MOCK_CONFIG, 'https://test.com');

    const editCall = recordedCalls.find(c => c.url.includes('/editMessageText'));
    assert.ok(editCall);
    assert.ok(editCall.json.text.includes('Sub Test Menu'));
  });
});
