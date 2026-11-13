// netlify/functions/remind.mjs
// Scheduled every 30 minutes: reminds the owner about voices left unanswered for REMIND_HOURS (0 = off)

import { connectNetlifyKv } from '../../lib/kv.js';
import { sendDueReminders } from '../../lib/reminders.js';

export default async () => {
  await connectNetlifyKv();
  const hours = parseFloat(process.env.REMIND_HOURS || '4');
  const sent = await sendDueReminders(process.env.TELEGRAM_BOT_TOKEN, hours);
  console.log(`[Remind] sent ${sent}`);
};

export const config = { schedule: '*/30 * * * *' };
