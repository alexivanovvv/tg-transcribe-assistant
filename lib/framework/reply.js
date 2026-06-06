// lib/framework/reply.js
// Generic Telegram reply payload builder helpers

export function buildReplyRequest(update, chatMessage, text, replyToMessage) {
  const chatId = chatMessage.chat.id;
  const messageId = replyToMessage === null ? null : (replyToMessage || chatMessage).message_id;
  const guestQueryId = chatMessage.guest_query_id || update.guest_message?.guest_query_id;
  const businessConnectionId = update.business_message?.business_connection_id;

  if (guestQueryId) {
    return {
      method: 'answerGuestQuery',
      payload: {
        guest_query_id: guestQueryId,
        result: {
          type: 'article',
          id: `reply_${messageId}_${Date.now()}`,
          title: 'Response',
          input_message_content: {
            message_text: text,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true
          }
        }
      }
    };
  }

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  };
  if (messageId) {
    payload.reply_to_message_id = messageId;
  }
  if (businessConnectionId) {
    payload.business_connection_id = businessConnectionId;
  }
  return { method: 'sendMessage', payload };
}
