import { configureLocalization } from './framework/localize.js';

// Constants for Telegram Tips links to mode documentation
const SECRETARY_URL = "https://t.me/TelegramTips/567";
const GUEST_URL = "https://t.me/TelegramTips/565";
const BOTFATHER_APP = "[miniapp](https://t.me/botfather?startapp)";
export const REPO_URL = "https://github.com/PublicAffairs/tg-transcribot";


const REPO_LINK = `[tg-transcribot](${REPO_URL})`;
const STT_API_URL = "https://console.groq.com/docs/speech-to-text#using-the-api";
const WHISPER_PROMPTING_GUIDE_URL = "https://developers.openai.com/cookbook/examples/whisper_prompting_guide";
const OPENAI_STT_URL = "https://developers.openai.com/api/docs/guides/speech-to-text";

export const translations = {
  en: {
    // Bot Profile Metadata
    botName: `Ponchik Assistant Bot`,
    botDescription: `Private Bot - Alex Ivanov and his team`,
    botShortDescription: `Private Bot - Alex Ivanov and his team`,
    
    noAudio: `⚠️ *No audio or voice message found in the reply.*`,
    replyRequired: `⚠️ *Use this command in reply to an audio or voice message.*`,
    help: `Hello! I am a transcription bot. Send or forward a voice message or audio file to me, and I will transcribe it into text.`,
    transcription: `🎤 *Transcription:*`,
    errorTranscription: `⚠️ *Transcription error:*`,
    error: `⚠️ *Error:*`,
    fileTooLarge: `⚠️ *File is too large.* The Telegram Bot API restricts downloads to a maximum of {max_mb} MB.`,
    notAudioFile: `⚠️ *Unsupported file format.* Only audio and video files can be transcribed.`,
    unsupportedVideo: `⚠️ *Unsupported video format.* Please send audio or video in MP4/WebM format.`,
    apiKeyMissing: `⚠️ *API Key is not configured!*
Please set the {key:code} environment variable on your server to enable transcription.`,
    settingsTitle: `🛠️ *Owner Settings:*`,
    welcomeMessage: `🤖 *Welcome to Transcribot!*

You have been successfully registered as the owner. You can reset owner status on the [dashboard]({dashboard_url}).

Commands:
/mode: Toggle active bot modes (_Groups_, [_Secretary_](${SECRETARY_URL}), [_Guest_](${GUEST_URL}))
/help: View all available commands and settings`,
    
    // Command Descriptions & Roles
    cmdHelp: `Show this help`,
    cmdLang: `Set transcription language`,
    cmdLangbot: `Set bot UI language`,
    cmdMode: `Toggle active bot modes (_Groups_, [_Secretary_](${SECRETARY_URL}), [_Guest_](${GUEST_URL}))`,
    cmdModel: `Select [Whisper](${STT_API_URL}) model`,
    cmdNotify: `Configure owner notifications`,
    cmdProcess: `Transcribe (_in reply to media_)`,
    cmdPromptUser: `Use [custom](${WHISPER_PROMPTING_GUIDE_URL}) prompt (_in reply to media_)`,
    cmdPromptAdmin: `Set [custom](${WHISPER_PROMPTING_GUIDE_URL}) Whisper prompt`,
    cmdReadme: `View repository README`,
    cmdConfig: `Manage bot settings and configuration`,
    cmdSettings: `Show current settings status`,
    cmdSetbotinfo: `Set/update bot name and description`,
    cmdVerbose: `Toggle technical data display`,
    cmdFormat: `Choose how transcriptions look`,
    cmdDict: `Vocabulary of names and terms for recognition`,
    cmdOutput: `Output modes: transcript, summary, reply options`,
    cmdWebhook: `View or change the bot's webhook URL`,
    botInfoSuccess: `✅ Bot name, description, and short description have been updated successfully.`,
    
    // Status Feedback Alert Texts
    unauthorized: `❌ Unauthorized: Admin access only.`,
    settingsUpdated: `✅ Settings updated successfully.`,
    webhookUpdateFailed: `❌ Webhook update failed: {error}`,
    btnStateOutOfSync: `⚠️ The button status was out of date. The menu has been refreshed.`,

    // /webhook command
    webhookTitle: `🔗 *Webhook URL:*
{url:code}
 
To move the bot to a new URL, send:
\`/webhook https://new-domain.example.com\`
 
🖥️ *Dashboard:* {dashboard_url}`,
    webhookMenuText: `Current URL: {url:code}

To update the bot webhook, send:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ Change URL…`,
    botVersion: `🤖 ${REPO_LINK} {val:code}`,
    webhookHealthChecking: `🔄 Checking availability of the new URL…`,
    webhookHealthOk: `✅ *Webhook updated successfully!*

*New URL:* {url:code}

_The bot has moved to the new server. This instance will no longer receive updates._`,
    webhookHealthFail: `❌ *New URL is not reachable.*

*URL:* {url:code}
*Error:* {error}

_Webhook was NOT changed. Please check the URL and try again._`,

    // Configuration Titles
    modeTitle: `⚙️ *Bot Modes:*
 
Configure active modes.`,
    langbotTitle: `🌐 *Bot UI Language:*
 
Select language for bot UI and system messages.`,
    langTitle: `🗣️ *Transcript: language:*
 
Choose the target language for [Whisper](${STT_API_URL}) voice recognition.
 
Current: *{val}*
 
💡 _If your language is not listed in the buttons, you can set it directly by sending:_
\`/lang <language_code>\` (e.g. \`/lang fr\`)`,
    modelTitle: `🧠 *Transcript: [model](${STT_API_URL}):*
 
Select the [AI model](${OPENAI_STT_URL}) used for transcription.`,
    notifyTitle: `🔔 *Owner Notifications:*
 
Configure what alerts the owner receives.`,
    notifyFooterHidden: `💡 _Some notification types are hidden because the corresponding modes are not active. See /mode._`,
    verboseTitle: `📝 *Show Technical Data:*
 
Toggles whether technical data (file format, size, duration) is appended to transcription replies.`,
    outputTitle: `📤 *Output modes:*
 
• *Transcript* - posted to the chat as a reply to the voice
• *Polish* - punctuation, sentences and fillers cleaned up before posting
• *Summary* and *Reply options* - only to you, privately in this chat with the bot`,
    transcriptHeader: `🎤 *Transcript*`,
    summaryHeader: `📝 *Summary*`,
    repliesHeader: `💬 *Reply options*`,
    btnMoreReplies: `🔄 More options`,
    replySent: `✅ Option {n} sent`,
    replyFailed: `❌ Could not send the reply`,
    repliesExpired: `These options have expired`,
    btnOutTranscript: `Transcript`,
    btnOutPolish: `Polish`,
    btnOutSummary: `Summary`,
    btnOutReplies: `Replies`,
    formatTitle: `🎨 *Transcript: format:*
 
How transcriptions look in chats. Pick a variant:`,
    formatVariant: `Variant {n}`,
    formatSample: `Yes, please, write it down. Tomorrow at 11 works for me, let us call in Zoom.`,
    secprivTitle: `🔒 *Secretary: private replies:*
 
When enabled, transcriptions from your business chats are sent only to you (in this chat with the bot) instead of being posted into the business chat.`,
    promptTitle: `✍️ *Transcript: prompt:*

To configure a custom prompt, send the /prompt command followed by your text.

Current prompt: _{val}_`,
    promptDefault: `Default template`,
    promptEmpty: `Empty (no prompt)`,
    promptCustomLabel: `custom`,
    promptTooLong: `⚠️ *Prompt is too long.*

Whisper supports a maximum of {max} tokens. Your text exceeds this limit.

Click the button below to trim the prompt to the allowed size and insert it into the input field:`,
    btnTruncatePrompt: `✂️ Trim & Use`,

    // Mode capability warnings
    modeFooter: `💡 _Some modes may require additional permissions — configure them via @BotFather or ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *Group additions are not enabled for this bot in BotFather.*

Enable via @BotFather (\`/setjoingroups\`) or ${BOTFATHER_APP}:
    → _select your bot_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *[_Secretary_](${SECRETARY_URL}) Mode is not enabled for this bot.*

Enable it via @BotFather or ${BOTFATHER_APP}:
    → _select your bot_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Guest_](${GUEST_URL}) Mode is not enabled for this bot.*

Enable it via _BotFather_'s ${BOTFATHER_APP}:
    → _select your bot_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Groups`,
    btnSecretary: `Secretary`,
    btnGuest: `Guest`,
    btnAutoLeave: ` (auto-leave)`,
    btnGroupJoinDisabled: `⚠️ Join Groups`,
    btnGroupJoinShort: `join`,
    btnAuto: `Auto-detect`,
    btnSecretaryAdditions: `Secretary Additions`,
    btnCriticalErrors: `Critical Errors`,
    btnOn: `ON`,
    btnOff: `OFF`,
    btnClearPrompt: `🗑️ Clear`,
    btnDefaultPrompt: `📝 Default Template`,
    btnOtherPrompt: `✍️ Custom…`,
    btnOtherLang: `🌐 Other…`,
    btnSetbotinfo: `🤖 Update Bot Profile`,
    btnBack: `« Back`,
    btnClose: `❌ Close`,
    btnMain: `🏠 Main`,
    btnErrorsShort: `Errors`,

    // Transcription Language Names
    langAuto: `✨ Auto-detect`,

    // System Notifications
    notifySecConnected: `👔 *Bot is connected as a secretary!*

*User:* {raw_user}
*Chat ID:* {chat_id:code}
*Status:* {can_reply}`,
    notifySecDisconnected: `👔 *Bot is disconnected as a secretary!*

*User:* {raw_user}
*Chat ID:* {chat_id:code}
*Status:* {can_reply}`,
    statusCanReply: `can reply in chats`,
    statusCannotReply: `cannot reply in chats`,
    notifyAddedGroup: `🤖 Bot added to group: *{title}* (ID: {chat_id:code}){link:raw}`,
    notifyTransError: `🔥 *Transcription Error in chat {chat_id:code}:*
{error:codeblock}`,
    doubtfulTranscription: `🤔 *Not sure about this transcription, not posted to {chat}:*`,
    notifyCriticalError: `🔥 *CRITICAL ERROR in Webhook:*
{error:codeblock}`,
    notifyWebhookChanged: `🔔 *Webhook Domain Changed*

*Previous:* {oldHost:code}
*New:* {newHost:code}

*Request Headers:*`,
    inviteLink: `Link`,
    tableHeaderParameter: `Parameter`,
    tableHeaderValue: `Value`,
    notifyNonOwnerStart: `🔔 *Non\\-Owner Started Bot*

*User:* {raw_user}
*Chat ID:* {chat_id:code}`,
    notifyUpdateError: `⚠️ *Critical Bot Error during update processing:*

{context:raw}

*Error Detail:*
{error:codeblock}`,
    guestWarning: `⚠️ Truncated: Start bot in private chat to receive long transcriptions`,
    errInvalidUrlFormat: `Invalid URL format`,
    errHttpStatus: `HTTP {status}`,
  },
  ru: {
    noAudio: `⚠️ *Аудио или голосовое сообщение не найдено в цитате.*`,
    replyRequired: `⚠️ *Используйте эту команду в ответ на аудио или голосовое сообщение.*`,
    help: `Привет! Я — бот-транскрибатор. Отправьте или перешлите мне голосовое сообщение либо аудиофайл, и я расшифрую его в текст.`,
    transcription: `🎤 *Транскрипция:*`,
    errorTranscription: `⚠️ *Ошибка транскрибации:*`,
    error: `⚠️ *Ошибка:*`,
    fileTooLarge: `⚠️ *Файл слишком большой.* Telegram Bot API ограничивает загрузку файлов максимум до {max_mb} МБ.`,
    notAudioFile: `⚠️ *Неподдерживаемый формат файла.* Можно расшифровывать только аудио- и видеофайлы.`,
    unsupportedVideo: `⚠️ *Этот формат видео не поддерживается.* Пожалуйста, отправьте аудио или видео в формате MP4/WebM.`,
    apiKeyMissing: `⚠️ *API-ключ не настроен!*
Пожалуйста, установите переменную окружения {key:code} на вашем сервере, чтобы включить расшифровку аудио.`,
    settingsTitle: `🛠️ *Настройки владельца:*`,
    welcomeMessage: `🤖 *Добро пожаловать в Transcribot!*

Вы успешно зарегистрированы в качестве владельца. Сбросить статус владельца можно на [дашборде]({dashboard_url}).

Команды:
/mode: Управление активными режимами бота (_Группы_, [_Секретарь_](${SECRETARY_URL}), [_Гость_](${GUEST_URL}))
/help: Просмотр всех настроек и команд`,
    
    // Command Descriptions & Roles
    cmdHelp: `Показать эту справку`,
    cmdLang: `Выбрать язык транскрибации`,
    cmdLangbot: `Выбрать язык интерфейса бота`,
    cmdMode: `Управление режимами (_Группы_, [_Секретарь_](${SECRETARY_URL}), [_Гость_](${GUEST_URL}))`,
    cmdModel: `Выбрать модель [Whisper](${STT_API_URL})`,
    cmdNotify: `Настроить уведомления`,
    cmdProcess: `Транскрибировать (_в ответ на медиа_)`,
    cmdPromptUser: `Использовать [кастомный](${WHISPER_PROMPTING_GUIDE_URL}) промпт (_в ответ на медиа_)`,
    cmdPromptAdmin: `Задать [кастомный](${WHISPER_PROMPTING_GUIDE_URL}) промпт Whisper`,
    cmdReadme: `Просмотр README репозитория`,
    cmdConfig: `Управление настройками и конфигурацией бота`,
    cmdSettings: `Показать текущие настройки`,
    cmdSetbotinfo: `Установить/обновить имя и описание бота`,
    cmdVerbose: `Вкл/выкл отображение тех. данных`,
    cmdFormat: `Выбрать, как выглядит расшифровка`,
    cmdDict: `Словарь имен и терминов для распознавания`,
    cmdOutput: `Режимы вывода: расшифровка, пересказ, ответы`,
    cmdWebhook: `Просмотр или смена URL вебхука бота`,
    botInfoSuccess: `✅ Имя, описание и краткое описание бота успешно обновлены.`,

    // Status Feedback Alert Texts
    unauthorized: `❌ Отказано в доступе: только для администратора.`,
    settingsUpdated: `✅ Настройки успешно обновлены.`,
    webhookUpdateFailed: `❌ Ошибка обновления вебхука: {error}`,
    btnStateOutOfSync: `⚠️ Статус кнопки устарел. Меню настроек обновлено.`,

    // /webhook command
    webhookTitle: `🔗 *URL вебхука:*
{url:code}
 
Чтобы перенести бота на новый URL, отправьте:
\`/webhook https://new-domain.example.com\`
 
🖥️ *Панель управления:* {dashboard_url}`,
    webhookMenuText: `Текущий URL: {url:code}

Чтобы обновить вебхук бота, отправьте:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ Изменить URL…`,
    botVersion: `🤖 ${REPO_LINK} {val:code}`,
    webhookHealthChecking: `🔄 Проверяю доступность нового URL…`,
    webhookHealthOk: `✅ *Вебхук успешно обновлён!*

*Новый URL:* {url:code}

_Бот перенесён на новый сервер. Этот экземпляр больше не будет получать обновления._`,
    webhookHealthFail: `❌ *Новый URL недоступен.*

*URL:* {url:code}
*Ошибка:* {error}

_Вебхук НЕ изменён. Проверьте URL и попробуйте снова._`,

    // Configuration Titles
    modeTitle: `⚙️ *Режимы бота:*
 
Настройте активные режимы.`,
    langbotTitle: `🌐 *Язык интерфейса бота:*
 
Выберите язык для интерфейса бота и системных сообщений.`,
    langTitle: `🗣️ *Транскрипт: язык:*
 
Выберите язык для транскрибации.`,
    modelTitle: `🧠 *Транскрипт: [модель](${STT_API_URL}):*
 
Выберите модель для транскрибации.`,
    notifyTitle: `🔔 *Уведомления владельца:*
 
Настройте оповещения, которые получает владелец.`,
    notifyFooterHidden: `💡 _Некоторые типы уведомлений скрыты, так как соответствующие режимы не активны. См. /mode._`,
    verboseTitle: `📝 *Отображение тех. данных:*
 
Переключает добавление технических данных (формат файла, размер, длительность) к ответам расшифровки.`,
    outputTitle: `📤 *Режимы вывода:*
 
• *Расшифровка* - в чат, реплаем на войс
• *Причесать* - знаки препинания, предложения и слова-паразиты правятся перед отправкой
• *Пересказ* и *Что ответить* - только тебе, в личку с ботом`,
    transcriptHeader: `🎤 *Расшифровка*`,
    summaryHeader: `📝 *Пересказ*`,
    repliesHeader: `💬 *Что ответить*`,
    btnMoreReplies: `🔄 Еще варианты`,
    replySent: `✅ Отправлен вариант {n}`,
    replyFailed: `❌ Не получилось отправить ответ`,
    repliesExpired: `Эти варианты устарели`,
    btnOutTranscript: `Расшифровка`,
    btnOutPolish: `Причесать`,
    btnOutSummary: `Пересказ`,
    btnOutReplies: `Что ответить`,
    formatTitle: `🎨 *Транскрипт: формат:*
 
Как выглядит расшифровка в чатах. Выберите вариант:`,
    formatVariant: `Вариант {n}`,
    formatSample: `Да, пожалуйста, записывай. Завтра в 11 удобно, созвонимся в Zoom.`,
    secprivTitle: `🔒 *Секретарь: только мне:*
 
Если включено, расшифровки из ваших бизнес-чатов приходят только вам (в этот чат с ботом), а не публикуются в самом бизнес-чате.`,
    promptTitle: `✍️ *Транскрипт: промпт:*

Чтобы настроить собственный промпт, отправьте команду /prompt, а затем ваш текст.

Текущий промпт: _{val}_`,
    promptDefault: `Шаблон по умолчанию`,
    promptEmpty: `Пустой (без промпта)`,
    promptCustomLabel: `кастомный`,
    promptTooLong: `⚠️ *Промпт слишком длинный.*

Whisper поддерживает максимум {max} токенов. Ваш текст превышает этот лимит.

Нажмите кнопку ниже, чтобы обрезать промпт до допустимого размера и вставить его в поле ввода:`,
    btnTruncatePrompt: `✂️ Обрезать`,

    // Mode capability warnings
    modeFooter: `💡 _Некоторые режимы могут требовать дополнительных разрешений — настройте их через @BotFather или ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *Добавление в группы не включено для этого бота.*

Включите через @BotFather (\`/setjoingroups\`) или ${BOTFATHER_APP}:
    → _выберите вашего бота_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *Режим [_Секретаря_](${SECRETARY_URL}) не включён для этого бота.*

Включите его через @BotFather или ${BOTFATHER_APP}:
    → _выберите вашего бота_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Гостевой_](${GUEST_URL}) режим не включён для этого бота.*

Включите его через ${BOTFATHER_APP} от _BotFather_:
    → _выберите вашего бота_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Группы`,
    btnSecretary: `Секретарь`,
    btnGuest: `Гость`,
    btnAutoLeave: ` (автовыход)`,
    btnGroupJoinDisabled: `⚠️ Вступление в группы`,
    btnGroupJoinShort: `вступление`,
    btnAuto: `Автоопределение`,
    btnSecretaryAdditions: `Добавление в секретари`,
    btnCriticalErrors: `Критические ошибки`,
    btnOn: `ВКЛ`,
    btnOff: `ВЫКЛ`,
    btnClearPrompt: `🗑️ Очистить`,
    btnDefaultPrompt: `📝 Шаблон по умолчанию`,
    btnOtherPrompt: `✍️ Свой…`,
    btnOtherLang: `🌐 Другой…`,
    btnSetbotinfo: `🤖 Обновить профиль бота`,
    btnBack: `« Назад`,
    btnClose: `❌ Закрыть`,
    btnMain: `🏠 Главное`,
    btnErrorsShort: `Ошибки`,

    // Transcription Language Names
    langAuto: `✨ Автоопределение`,

    // System Notifications
    notifySecConnected: `👔 *Бот подключен в режиме секретаря!*

*Пользователь:* {raw_user}
*ID чата:* {chat_id:code}
*Статус:* {can_reply}`,
    notifySecDisconnected: `👔 *Бот отключен от режима секретаря!*

*Пользователь:* {raw_user}
*ID чата:* {chat_id:code}
*Статус:* {can_reply}`,
    statusCanReply: `может отвечать в чатах`,
    statusCannotReply: `не может отвечать в чатах`,
    notifyAddedGroup: `🤖 Бот добавлен в группу: *{title}* (ID: {chat_id:code}){link:raw}`,
    notifyTransError: `🔥 *Ошибка транскрибации в чате {chat_id:code}:*
{error:codeblock}`,
    doubtfulTranscription: `🤔 *Не уверен в расшифровке, в чат {chat} не отправил:*`,
    notifyCriticalError: `🔥 *КРИТИЧЕСКАЯ ОШИБКА в Вебхуке:*
{error:codeblock}`,
    notifyWebhookChanged: `🔔 *Домен вебхука изменен*

*Предыдущий:* {oldHost:code}
*Новый:* {newHost:code}

*Заголовки запроса:*`,
    inviteLink: `Ссылка`,
    tableHeaderParameter: `Параметр`,
    tableHeaderValue: `Значение`,
    notifyNonOwnerStart: `🔔 *Не\\-владелец запустил бота*

*Пользователь:* {raw_user}
*ID чата:* {chat_id:code}`,
    notifyUpdateError: `⚠️ *Критическая ошибка бота при обработке обновления:*

{context:raw}

*Детали ошибки:*
{error:codeblock}`,
    guestWarning: `⚠️ Сокращено: Начните диалог с ботом в личных сообщениях, чтобы получать полные расшифровки`,
    errInvalidUrlFormat: `Неверный формат URL`,
    errHttpStatus: `HTTP {status}`,
  },
  de: {
    noAudio: `⚠️ *In der Antwort wurde keine Audio- oder Sprachnachricht gefunden.*`,
    replyRequired: `⚠️ *Verwenden Sie diesen Befehl als Antwort auf eine Audio- oder Sprachnachricht.*`,
    help: `Hallo! Ich bin ein Transkriptions-Bot. Senden oder leiten Sie mir eine Sprachnachricht oder eine Audiodatei weiter, und ich werde sie in Text umwandeln.`,
    transcription: `🎤 *Transkription:*`,
    errorTranscription: `⚠️ *Transkriptionsfehler:*`,
    error: `⚠️ *Fehler:*`,
    fileTooLarge: `⚠️ *Die Datei ist zu groß.* Die Telegram-Bot-API beschränkt Downloads auf maximal {max_mb} MB.`,
    notAudioFile: `⚠️ *Nicht unterstütztes Dateiformat.* Es können nur Audio- und Videodateien transkribiert werden.`,
    unsupportedVideo: `⚠️ *Dieses Videoformat wird nicht unterstützt.* Bitte senden Sie Audio oder Video im MP4/WebM-Format.`,
    apiKeyMissing: `⚠️ *API-Schlüssel ist nicht konfiguriert!*
Bitte legen Sie die Umgebungsvariable {key:code} auf Ihrem Server fest, um die Transkription zu aktivieren.`,
    settingsTitle: `🛠️ *Eigentümer-Einstellungen:*`,
    welcomeMessage: `🤖 *Willkommen bei Transcribot!*

Sie wurden erfolgreich als Besitzer registriert. Sie können den Besitzer-Status im [Dashboard]({dashboard_url}) zurücksetzen.

Befehle:
/mode: Bot-Modi umschalten (_Gruppen_, [_Sekretär_](${SECRETARY_URL}), [_Gäste_](${GUEST_URL}))
/help: Alle Einstellungen und Befehle anzeigen`,
    
    // Command Descriptions & Roles
    cmdHelp: `Diese Hilfe anzeigen`,
    cmdLang: `Transkriptionssprache einstellen`,
    cmdLangbot: `Sprache der Benutzeroberfläche einstellen`,
    cmdMode: `Bot-Modi umschalten (_Gruppen_, [_Sekretär_](${SECRETARY_URL}), [_Gäste_](${GUEST_URL}))`,
    cmdModel: `[Whisper](${STT_API_URL})-Modell auswählen`,
    cmdNotify: `Benachrichtigungen konfigurieren`,
    cmdProcess: `Transkribieren (_als Antwort auf Medien_)`,
    cmdPromptUser: `[Benutzerdefinierten](${WHISPER_PROMPTING_GUIDE_URL}) Prompt verwenden (_als Antwort auf Medien_)`,
    cmdPromptAdmin: `[Benutzerdefinierten](${WHISPER_PROMPTING_GUIDE_URL}) Whisper-Prompt einstellen`,
    cmdReadme: `Repository-README anzeigen`,
    cmdConfig: `Bot-Einstellungen und Konfiguration verwalten`,
    cmdSettings: `Aktuelle Einstellungen anzeigen`,
    cmdSetbotinfo: `Bot-Name und Beschreibungen aktualisieren`,
    cmdVerbose: `Technische Daten umschalten`,
    cmdFormat: `Aussehen der Transkription wählen`,
    cmdDict: `Wörterbuch für Namen und Begriffe`,
    cmdOutput: `Ausgabemodi: Transkript, Zusammenfassung, Antworten`,
    cmdWebhook: `Webhook-URL des Bots anzeigen oder ändern`,
    botInfoSuccess: `✅ Bot-Name, Beschreibung und Kurzbeschreibung wurden erfolgreich aktualisiert.`,

    // Status Feedback Alert Texts
    unauthorized: `❌ Nicht autorisiert: Nur für Administratoren.`,
    settingsUpdated: `✅ Einstellungen erfolgreich aktualisiert.`,
    webhookUpdateFailed: `❌ Webhook-Aktualisierung fehlgeschlagen: {error}`,
    btnStateOutOfSync: `⚠️ Der Tastenstatus war veraltet. Das Menü wurde aktualisiert.`,

    // /webhook command
    webhookTitle: `🔗 *Webhook-URL:*
{url:code}
 
Um den Bot auf eine neue URL zu verschieben, senden Sie:
\`/webhook https://new-domain.example.com\`
 
🖥️ *Dashboard:* {dashboard_url}`,
    webhookMenuText: `Aktuelle URL: {url:code}

Um den Webhook des Bots zu aktualisieren, senden Sie:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ URL ändern…`,
    botVersion: `🤖 ${REPO_LINK} {val:code}`,
    webhookHealthChecking: `🔄 Verfügbarkeit der neuen URL wird geprüft…`,
    webhookHealthOk: `✅ *Webhook erfolgreich aktualisiert!*

*Neue URL:* {url:code}

_Der Bot wurde auf den neuen Server verschoben. Diese Instanz empfängt keine Updates mehr._`,
    webhookHealthFail: `❌ *Neue URL ist nicht erreichbar.*

*URL:* {url:code}
*Fehler:* {error}

_Der Webhook wurde NICHT geändert. Bitte überprüfen Sie die URL und versuchen Sie es erneut._`,

    // Configuration Titles
    modeTitle: `⚙️ *Bot-Modi:*
 
Konfigurieren Sie die aktiven Modi.`,
    langbotTitle: `🌐 *Sprache der Benutzeroberfläche:*
 
Wählen Sie die Sprache für die Bot-Benutzeroberfläche und Systemmeldungen.`,
    langTitle: `🗣️ *Transkript: Sprache:*
 
Wählen Sie die Sprache für die Transkription.`,
    modelTitle: `🧠 *Transkript: [Modell](${STT_API_URL}):*
 
Wählen Sie das Modell für die Transkription.`,
    notifyTitle: `🔔 *Benachrichtigungen des Eigentümers:*
 
Konfigurieren Sie, welche Warnungen der Eigentümer erhält.`,
    notifyFooterHidden: `💡 _Einige Benachrichtigungstypen sind ausgeblendet, da die entsprechenden Modi nicht aktiv sind. Siehe /mode._`,
    verboseTitle: `📝 *Technische Daten anzeigen:*
 
Schaltet um, ob technische Daten (Dateiformat, Größe, Dauer) an die Transkriptionsantworten angehängt werden.`,
    outputTitle: `📤 *Ausgabemodi:*
 
• *Transkript* - als Antwort auf die Sprachnachricht in den Chat
• *Glätten* - Zeichensetzung, Sätze und Füllwörter vor dem Senden bereinigt
• *Zusammenfassung* und *Antwortvorschläge* - nur an dich, privat in diesem Chat mit dem Bot`,
    transcriptHeader: `🎤 *Transkript*`,
    summaryHeader: `📝 *Zusammenfassung*`,
    repliesHeader: `💬 *Antwortvorschläge*`,
    btnMoreReplies: `🔄 Weitere Vorschläge`,
    replySent: `✅ Vorschlag {n} gesendet`,
    replyFailed: `❌ Antwort konnte nicht gesendet werden`,
    repliesExpired: `Diese Vorschläge sind abgelaufen`,
    btnOutTranscript: `Transkript`,
    btnOutPolish: `Glätten`,
    btnOutSummary: `Zusammenfassung`,
    btnOutReplies: `Antworten`,
    formatTitle: `🎨 *Transkript: Format:*
 
So sehen Transkriptionen in Chats aus. Variante wählen:`,
    formatVariant: `Variante {n}`,
    formatSample: `Ja, bitte, schreib mit. Morgen um 11 passt, wir telefonieren per Zoom.`,
    secprivTitle: `🔒 *Sekretär: nur an mich:*
 
Wenn aktiviert, werden Transkriptionen aus Ihren Business-Chats nur an Sie (in diesen Chat mit dem Bot) gesendet, statt im Business-Chat veröffentlicht zu werden.`,
    promptTitle: `✍️ *Transkript: Prompt:*

Um einen benutzerdefinierten Prompt zu konfigurieren, senden Sie den Befehl /prompt gefolgt von Ihrem Text.

Aktuell prompt: _{val}_`,
    promptDefault: `Standard-Vorlage`,
    promptEmpty: `Leer (kein Prompt)`,
    promptCustomLabel: `benutzerdefinierten`,
    promptTooLong: `⚠️ *Prompt ist zu lang.*

Whisper unterstützt maximal {max} Token. Ihr Text überschreitet dieses Limit.

Klicken Sie auf die Schaltfläche unten, um den Prompt auf die zulässige Größe zu kürzen und ihn in das Eingabefeld einzufügen:`,
    btnTruncatePrompt: `✂️ Kürzen`,

    // Mode capability warnings
    modeFooter: `💡 _Einige Modi erfordern möglicherweise zusätzliche Berechtigungen — konfigurieren Sie diese über @BotFather oder ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *Hinzufügen zu Gruppen ist für diesen Bot nicht aktiviert.*

Aktivieren über @BotFather (\`/setjoingroups\`) oder ${BOTFATHER_APP}:
    → _wählen Sie Ihren Bot aus_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *[_Sekretär_](${SECRETARY_URL})-Modus ist für diesen Bot nicht aktiviert.*

Aktivieren Sie ihn über @BotFather oder ${BOTFATHER_APP}:
    → _wählen Sie Ihren Bot aus_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Gast_](${GUEST_URL})-Modus ist für diesen Bot nicht aktiviert.*

Aktivieren Sie ihn über _BotFather_'s ${BOTFATHER_APP}:
    → _wählen Sie Ihren Bot aus_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Gruppen`,
    btnSecretary: `Sekretär`,
    btnGuest: `Gast`,
    btnAutoLeave: ` (Auto-Verlassen)`,
    btnGroupJoinDisabled: `⚠️ Gruppenbeitritt`,
    btnGroupJoinShort: `Beitritt`,
    btnAuto: `Automatisch`,
    btnSecretaryAdditions: `Sekretär-Hinzufügungen`,
    btnCriticalErrors: `Kritische Fehler`,
    btnOn: `AN`,
    btnOff: `AUS`,
    btnClearPrompt: `🗑️ Löschen`,
    btnDefaultPrompt: `📝 Standard-Vorlage`,
    btnOtherPrompt: `✍️ Eigener…`,
    btnOtherLang: `🌐 Anderer…`,
    btnSetbotinfo: `🤖 Bot-Profil aktualisieren`,
    btnBack: `« Zurück`,
    btnClose: `❌ Schließen`,
    btnMain: `🏠 Hauptmenü`,
    btnErrorsShort: `Fehler`,

    // Transcription Language Names
    langAuto: `✨ Automatisch`,

    // System Notifications
    notifySecConnected: `👔 *Bot ist als Sekretär verbunden!*

*Benutzer:* {raw_user}
*Chat-ID:* {chat_id:code}
*Status:* {can_reply}`,
    notifySecDisconnected: `👔 *Bot-Verbindung als Sekretär getrennt!*

*Benutzer:* {raw_user}
*Chat-ID:* {chat_id:code}
*Status:* {can_reply}`,
    statusCanReply: `kann in Chats antworten`,
    statusCannotReply: `kann nicht in Chats antworten`,
    notifyAddedGroup: `🤖 Bot zur Gruppe hinzugefügt: *{title}* (ID: {chat_id:code}){link:raw}`,
    notifyTransError: `🔥 *Transkriptionsfehler im Chat {chat_id:code}:*
{error:codeblock}`,
    doubtfulTranscription: `🤔 *Unsicher bei dieser Transkription, nicht an {chat} gesendet:*`,
    notifyCriticalError: `🔥 *KRITISCHER FEHLER im Webhook:*
{error:codeblock}`,
    notifyWebhookChanged: `🔔 *Webhook-Domain geändert*

*Vorheriger:* {oldHost:code}
*Neuer:* {newHost:code}

*Anfrage-Header:*`,
    inviteLink: `Link`,
    tableHeaderParameter: `Parameter`,
    tableHeaderValue: `Wert`,
    notifyNonOwnerStart: `🔔 *Nicht\\-Besitzer hat den Bot gestartet*

*Benutzer:* {raw_user}
*Chat-ID:* {chat_id:code}`,
    notifyUpdateError: `⚠️ *Kritischer Bot-Fehler bei der Update-Verarbeitung:*

{context:raw}

*Fehlerdetails:*
{error:codeblock}`,
    guestWarning: `⚠️ Gekürzt: Starten Sie den Bot im privaten Chat, um lange Transkriptionen zu erhalten`,
    errInvalidUrlFormat: `Ungültiges URL-Format`,
    errHttpStatus: `HTTP {status}`,
  },
  uk: {
    noAudio: `⚠️ *Аудіо або голосове повідомлення не знайдено в цитаті.*`,
    replyRequired: `⚠️ *Використовуйте цю команду у відповідь на аудіо або голосове повідомлення.*`,
    help: `Привіт! Я — бот-транскрибатор. Надішліть або перешліть мені голосове повідомлення або аудіофайл, і я розшифрую його в текст.`,
    transcription: `🎤 *Транскрипція:*`,
    errorTranscription: `⚠️ *Помилка транскрибації:*`,
    error: `⚠️ *Помилка:*`,
    fileTooLarge: `⚠️ *Файл занадто великий.* Telegram Bot API обмежує завантаження файлів максимум до {max_mb} МБ.`,
    notAudioFile: `⚠️ *Непідтримуваний формат файлу.* Можна розшифровувати тільки аудіо- та відеофайли.`,
    unsupportedVideo: `⚠️ *Цей формат відео не підтримується.* Будь ласка, надішліть аудіо або відео у форматі MP4/WebM.`,
    apiKeyMissing: `⚠️ *API-ключ не налаштований!*
Будь ласка, встановіть змінну оточення {key:code} на вашому сервері, щоб увімкнути транскрибацію.`,
    settingsTitle: `🛠️ *Налаштування власника:*`,
    welcomeMessage: `🤖 *Ласкаво просимо до Transcribot!*

Ви успішно зареєстровані як власник. Скинути статус власника можна на [дашборді]({dashboard_url}).

Команди:
/mode: Керування активними режимами бота (_Групи_, [_Секретар_](${SECRETARY_URL}), [_Гість_](${GUEST_URL}))
/help: Перегляд усіх налаштувань та команд`,
    
    // Command Descriptions & Roles
    cmdHelp: `Показати цю довідку`,
    cmdLang: `Вибрати мову транскрибації`,
    cmdLangbot: `Вибрати мову інтерфейсу бота`,
    cmdMode: `Керування режимами (_Групи_, [_Секретар_](${SECRETARY_URL}), [_Гість_](${GUEST_URL}))`,
    cmdModel: `Вибирати модель [Whisper](${STT_API_URL})`,
    cmdNotify: `Налаштувати сповіщення`,
    cmdProcess: `Транскрибувати (_у відповідь на медіа_)`,
    cmdPromptUser: `Використовувати [власний](${WHISPER_PROMPTING_GUIDE_URL}) промпт (_у відповідь на медіа_)`,
    cmdPromptAdmin: `Задати [власний](${WHISPER_PROMPTING_GUIDE_URL}) промпт Whisper`,
    cmdReadme: `Перегляд README репозиторію`,
    cmdConfig: `Керування налаштуваннями та конфігурацією бота`,
    cmdSettings: `Покази поточні налаштування`,
    cmdSetbotinfo: `Встановити/оновити ім'я та опис бота`,
    cmdVerbose: `Увімкнути/вимкнути тех. дані`,
    cmdFormat: `Обрати, як виглядає розшифровка`,
    cmdDict: `Словник імен і термінів для розпізнавання`,
    cmdOutput: `Режими виводу: розшифровка, переказ, відповіді`,
    cmdWebhook: `Переглянути або змінити URL вебхука бота`,
    botInfoSuccess: `✅ Ім'я, опис та короткий опис бота успішно оновлено.`,

    // Status Feedback Alert Texts
    unauthorized: `❌ Відмовлено в доступі: тільки для адміністратора.`,
    settingsUpdated: `✅ Налаштування успішно оновлено.`,
    webhookUpdateFailed: `❌ Помилка оновлення вебхука: {error}`,
    btnStateOutOfSync: `⚠️ Статус кнопки застарів. Меню налаштувань оновлено.`,

    // /webhook command
    webhookTitle: `🔗 *URL вебхука:*
{url:code}
 
Щоб перенести бота на новий URL, надішліть:
\`/webhook https://new-domain.example.com\`
 
🖥️ *Панель управління:* {dashboard_url}`,
    webhookMenuText: `Поточний URL: {url:code}

Щоб оновити вебхук бота, надішліть:
\`/webhook https://new-domain.example.com\``,
    btnChangeWebhook: `✏️ Змінити URL…`,
    botVersion: `🤖 ${REPO_LINK} {val:code}`,
    webhookHealthChecking: `🔄 Перевіряю доступність нового URL…`,
    webhookHealthOk: `✅ *Вебхук успішно оновлено!*

*Новий URL:* {url:code}

_Бот перенесений на новий сервер. Цей екземпляр більше не отримуватиме оновлень._`,
    webhookHealthFail: `❌ *Новий URL недоступний.*

*URL:* {url:code}
*Помилка:* {error}

_Вебхук НЕ змінено. Перевірте URL і спробуйте знову._`,

    // Configuration Titles
    modeTitle: `⚙️ *Режими бота:*
 
Налаштуйте активні режими.`,
    langbotTitle: `🌐 *Мова інтерфейсу бота:*
 
Виберіть мову для інтерфейсу бота та системних повідомлень.`,
    langTitle: `🗣️ *Транскрипт: мова:*
 
Виберіть мову для транскрибації.`,
    modelTitle: `🧠 *Транскрипт: [модель](${STT_API_URL}):*
 
Виберіть модель для транскрибації.`,
    notifyTitle: `🔔 *Сповіщення власника:*
 
Налаштуйте сповіщення, які отримує власник.`,
    notifyFooterHidden: `💡 _Деякі типи сповіщень приховані, оскільки відповідні режими не активні. Див. /mode._`,
    verboseTitle: `📝 *Відображення тех. даних:*
 
Перемикає додавання технічних даних (формат файлу, размер, тривалість) до відповідей розшифровки.`,
    outputTitle: `📤 *Режими виводу:*
 
• *Розшифровка* - у чат, реплаєм на войс
• *Причесати* - розділові знаки, речення і слова-паразити виправляються перед відправкою
• *Переказ* і *Що відповісти* - лише тобі, в особисті з ботом`,
    transcriptHeader: `🎤 *Розшифровка*`,
    summaryHeader: `📝 *Переказ*`,
    repliesHeader: `💬 *Що відповісти*`,
    btnMoreReplies: `🔄 Ще варіанти`,
    replySent: `✅ Надіслано варіант {n}`,
    replyFailed: `❌ Не вдалося надіслати відповідь`,
    repliesExpired: `Ці варіанти застаріли`,
    btnOutTranscript: `Розшифровка`,
    btnOutPolish: `Причесати`,
    btnOutSummary: `Переказ`,
    btnOutReplies: `Що відповісти`,
    formatTitle: `🎨 *Транскрипт: формат:*
 
Як виглядає розшифровка в чатах. Оберіть варіант:`,
    formatVariant: `Варіант {n}`,
    formatSample: `Так, будь ласка, записуй. Завтра об 11 зручно, зідзвонимося в Zoom.`,
    secprivTitle: `🔒 *Секретар: лише мені:*
 
Якщо увімкнено, розшифровки з ваших бізнес-чатів надходять лише вам (у цей чат із ботом), а не публікуються в самому бізнес-чаті.`,
    promptTitle: `✍️ *Транскрипт: промпт:*

Щоб налаштувати власний промпт, надішліть команду /prompt, а потім ваш текст.

Поточний промпт: _{val}_`,
    promptDefault: `Шаблон за замовчуванням`,
    promptEmpty: `Порожній (без промпту)`,
    promptCustomLabel: `власний`,
    promptTooLong: `⚠️ *Промпт задовгий.*

Whisper підтримує максимум {max} токенів. Ваш текст перевищує цей ліміт.

Натисніть кнопку нижче, щоб обрізати промпт до допустимого розміру та вставити його в поле введення:`,
    btnTruncatePrompt: `✂️ Обрізати`,

    // Mode capability warnings
    modeFooter: `💡 _Деякі режими можуть вимагати додаткових дозволів — налаштуйте їх через @BotFather або ${BOTFATHER_APP}._`,
    modeDisabledGroups: `⚠️ *Додавання до груп не увімкнено для цього бота.*

Увімкніть через @BotFather (\`/setjoingroups\`) або ${BOTFATHER_APP}:
    → _оберіть вашого бота_
    → Bot Settings
    → *Allow Groups*`,
    modeDisabledSecretary: `⚠️ *Режим [_Секретаря_](${SECRETARY_URL}) не увімкнено для цього бота.*

Увімкніть його через @BotFather або ${BOTFATHER_APP}:
    → _оберіть вашого бота_
    → Bot Settings
    → *Secretary Mode*`,
    modeDisabledGuest: `⚠️ *[_Гостьовий_](${GUEST_URL}) режим не увімкнено для цього бота.*

Увімкніть його через ${BOTFATHER_APP} від _BotFather_:
    → _оберіть вашого бота_
    → Bot Settings
    → *Guest Chat Mode*`,

    // Inline Keyboard Button Labels
    btnGroups: `Групи`,
    btnSecretary: `Секретар`,
    btnGuest: `Гість`,
    btnAutoLeave: ` (автовихід)`,
    btnGroupJoinDisabled: `⚠️ Вступ до груп`,
    btnGroupJoinShort: `вступ`,
    btnAuto: `Автовизначення`,
    btnSecretaryAdditions: `Додавання в секретарі`,
    btnCriticalErrors: `Критичні помилки`,
    btnOn: `УВІМК`,
    btnOff: `ВИМК`,
    btnClearPrompt: `🗑️ Очистити`,
    btnDefaultPrompt: `📝 Шаблон за замовчуванням`,
    btnOtherPrompt: `✍️ Свій…`,
    btnOtherLang: `🌐 Інший…`,
    btnSetbotinfo: `🤖 Оновити профіль бота`,
    btnBack: `« Назад`,
    btnClose: `❌ Закрити`,
    btnMain: `🏠 Головне`,
    btnErrorsShort: `Помилки`,

    // Transcription Language Names
    langAuto: `✨ Автовизначення`,

    // System Notifications
    notifySecConnected: `👔 *Бот підключений у режимі секретаря!*

*Користувач:* {raw_user}
*ID чату:* {chat_id:code}
*Статус:* {can_reply}`,
    notifySecDisconnected: `👔 *Бот відключений від режиму секретаря!*

*Користувач:* {raw_user}
*ID чату:* {chat_id:code}
*Статус:* {can_reply}`,
    statusCanReply: `може відповідати в чатах`,
    statusCannotReply: `не може відповідати в чатах`,
    notifyAddedGroup: `🤖 Бот доданий до групи: *{title}* (ID: {chat_id:code}){link:raw}`,
    notifyTransError: `🔥 *Помилка транскрибації в чаті {chat_id:code}:*
{error:codeblock}`,
    doubtfulTranscription: `🤔 *Не впевнений у розшифровці, в чат {chat} не надіслав:*`,
    notifyCriticalError: `🔥 *КРИТИЧНА ПОМИЛКА у Вебхуці:*
{error:codeblock}`,
    notifyWebhookChanged: `🔔 *Домен вебхука змінено*

*Попередній:* {oldHost:code}
*Новий:* {newHost:code}

*Заголовки запиту:*`,
    inviteLink: `Посилання`,
    tableHeaderParameter: `Параметр`,
    tableHeaderValue: `Значення`,
    notifyNonOwnerStart: `🔔 *Не\\-власник запустив бота*

*Користувач:* {raw_user}
*ID чату:* {chat_id:code}`,
    notifyUpdateError: `⚠️ *Критична помилка бота під час обробки оновлення:*

{context:raw}

*Деталі помилки:*
{error:codeblock}`,
    guestWarning: `⚠️ Скорочено: Почніть діалог з ботом в особистих повідомленнях, щоб отримувати повні розшифровки`,
    errInvalidUrlFormat: `Неправильний формат URL`,
    errHttpStatus: `HTTP {status}`,
  }
};

configureLocalization(translations);

export { getTranslation, getMarkdown, getUserLang, hasTranslation } from './framework/localize.js';

