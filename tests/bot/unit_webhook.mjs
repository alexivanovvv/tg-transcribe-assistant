import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook } from '../../lib/core.js';
import {
  recordedCalls,
  installMockFetch,
  restoreFetch,
  makeReq,
  mkJson,
  MOCK_CONFIG,
  MOCK_CTX
} from '../whitebox_helper.mjs';

describe('Bot unit_webhook', () => {
  beforeEach(() => { recordedCalls.length = 0; });
  afterEach(() => restoreFetch());

  test('Bot group settings auto-leave', async () => {
    installMockFetch({
      '/leaveChat': () => mkJson({ ok: true, result: true })
    });

    const update = {
      update_id: 99001,
      message: {
        chat: { type: 'group', id: -1122 },
        from: { id: 99999 }
      }
    };
    const req = makeReq(update, { owner: '99999', groups: 'leave' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);

    const leaveCall = recordedCalls.find(c => c.url.includes('/leaveChat'));
    assert.ok(leaveCall, 'leaveChat must be called when bot leaves group');
    assert.equal(leaveCall.json.chat_id, -1122);
  });

  test('Guest mode settings — disabled guest mode sends no message', async () => {
    installMockFetch({
      '/sendMessage': () => mkJson({ ok: true, result: {} })
    });

    const update = {
      update_id: 99002,
      guest_message: {
        chat: { type: 'private', id: 555 },
        from: { id: 555 }
      }
    };
    const req = makeReq(update, { owner: '99999', guest: 'off' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);

    const msgCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
    assert.ok(!msgCall, 'Should NOT send message if guest mode is disabled');
  });

  test('my_chat_member status changes — bot added to group notifies owner', async () => {
    installMockFetch({
      '/sendMessage': () => mkJson({ ok: true, result: {} })
    });

    const update = {
      update_id: 99003,
      my_chat_member: {
        chat: { id: -202, title: 'Group', type: 'group' },
        from: { id: 99999 },
        old_chat_member: { status: 'left' },
        new_chat_member: { status: 'member' }
      }
    };
    const req = makeReq(update, { owner: '99999' });
    await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);

    const msgCall = recordedCalls.find(c => c.url.includes('/sendMessage'));
    assert.ok(msgCall, 'Should notify owner when bot is added to group');
  });
});
