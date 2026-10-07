// lib/transcriber.js
// Audio downloading and Whisper API orchestration

import { detectAudioFormat, wrapAacInWav, wrapCafInWav, wrapRawAudioInWav } from './wav-wrapper.js';
import { callTelegram, readFirstBytes } from './framework/utils.js';
import { getAvailableModels } from './menus.js';
import { formatParagraphs, assessTranscription, isHallucinatedText } from './utils.js';
import { sliceOggOpus } from './ogg.js';

// Timeouts in milliseconds
export const DOWNLOAD_TIMEOUT = 30000;
export const TRANSCRIBE_TIMEOUT = 60000;

// Default API settings
export const DEFAULT_API_BASE = 'https://api.groq.com/openai/v1';
export const DEFAULT_WHISPER_MODEL = 'whisper-large-v3';

// Whisper sometimes collapses a 30-second window of real speech into a couple of words
// (often a term from the prompt) or a subtitle credit. Normal speech is ~10-15 chars/s.
const LOST_SEGMENT_MIN_SECONDS = 6;
const LOST_SEGMENT_MAX_CHARS_PER_SECOND = 4;
const MAX_REPAIRED_RANGES = 3;
const REPAIR_TIMEOUT = 5000;

function findLostRanges(segments) {
  const ranges = [];
  for (const seg of segments) {
    const duration = (seg.end ?? 0) - (seg.start ?? 0);
    const letters = ((seg.text || '').match(/\p{L}/gu) || []).length;
    const lost = isHallucinatedText(seg.text)
      || (duration >= LOST_SEGMENT_MIN_SECONDS && letters / duration < LOST_SEGMENT_MAX_CHARS_PER_SECOND);
    if (!lost) continue;
    const last = ranges[ranges.length - 1];
    if (last && seg.start - last.end < 1) {
      last.end = seg.end;
      last.segments.push(seg);
    } else {
      ranges.push({ start: seg.start, end: seg.end, segments: [seg] });
    }
  }
  return ranges.slice(0, MAX_REPAIRED_RANGES);
}

/**
 * Re-transcribes segments Whisper lost, from a cut of just that time range and without the prompt
 * (prompt terms are what leaks into collapsed windows). Returns repaired segments or null if nothing changed.
 */
async function repairLostSegments(audio, segments, { transcriptionUrl, apiKey, model, language }) {
  const ranges = findLostRanges(segments);
  if (!ranges.length) return null;
  const results = await Promise.all(ranges.map(async (range) => {
    try {
      const slice = sliceOggOpus(audio, range.start, range.end);
      if (!slice) return null;
      const form = new FormData();
      form.append('file', new Blob([slice], { type: 'audio/ogg' }), 'audio.ogg');
      form.append('model', model);
      form.append('response_format', 'json');
      if (language && language !== 'auto') form.append('language', language);
      const res = await fetch(transcriptionUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(REPAIR_TIMEOUT)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = ((await res.json()).text || '').trim();
      return isHallucinatedText(text) ? '' : text;
    } catch (e) {
      console.warn(`[Repair] ${range.start.toFixed(0)}-${range.end.toFixed(0)}s failed: ${e.message}`);
      return null;
    }
  }));
  let changed = false;
  const replaced = new Map();
  ranges.forEach((range, i) => {
    let text = results[i];
    // Re-run failed: still drop a known hallucination rather than post it
    if (text === null) text = range.segments.every(seg => isHallucinatedText(seg.text)) ? '' : null;
    if (text === null) return;
    changed = true;
    console.log(`[Repair] Re-transcribed ${range.start.toFixed(0)}-${range.end.toFixed(0)}s: ${range.segments.map(s => s.text.trim()).join(' ').length} -> ${text.length} chars`);
    range.segments.forEach((seg, j) => replaced.set(seg, j === 0 ? text : ''));
  });
  if (!changed) return null;
  return segments
    .map(seg => replaced.has(seg) ? { ...seg, text: replaced.get(seg) } : seg)
    .filter(seg => (seg.text || '').trim());
}

/**
 * Transcribe the audio/video file via Groq/OpenAI Whisper API.
 */
export async function transcribeAudio(fileId, config, settings, overridePrompt) {
  const token = config.telegramBotToken;
  const apiKey = config.whisperApiKey;
  const apiBase = config.whisperApiBase || DEFAULT_API_BASE;
  
  const availableModels = getAvailableModels(config);
  const whisperModel = settings.model || availableModels[0] || DEFAULT_WHISPER_MODEL;
  
  const whisperLanguage = settings.lang;
  const defaultPrompt = config.whisperPrompt || '';
  const whisperPrompt = overridePrompt !== undefined
    ? overridePrompt
    : (settings.prompt !== undefined
      ? settings.prompt
      : defaultPrompt);

  try {
    // 2. Get file info from Telegram
    const fileInfo = await callTelegram(token, 'getFile', { file_id: fileId });
    
    if (!fileInfo.ok) {
      return { ok: false, error: fileInfo.error || 'Failed to get file info' };
    }

    const filePath = fileInfo.result.file_path || '';
    const fileSizeBytes = fileInfo.result.file_size || 0;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    let ext = filePath.split('.').pop() || 'ogg';
    if (ext === 'oga' || ext === 'opus') ext = 'ogg';

    // Check if the extension is an unsupported video format
    if (['mov', 'mkv', 'avi', '3gp', 'flv', 'wmv', 'm4v'].includes(ext.toLowerCase())) {
      return { ok: false, error: 'UNSUPPORTED_VIDEO_FORMAT' };
    }

    // Optimize: range requests for unknown/non-native formats > 5 MB
    const NATIVE_EXTENSIONS = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'oga', 'opus', 'flac'];
    const isNative = NATIVE_EXTENSIONS.includes(ext.toLowerCase());
    if (!isNative && fileSizeBytes > 5 * 1024 * 1024) {
      console.log(`Non-native format extension .${ext} with size ${fileSizeBytes} bytes exceeds 5MB. Performing partial Range request check...`);
      try {
        const firstBytes = await readFirstBytes(fileUrl, 64, DOWNLOAD_TIMEOUT);
        const detected = detectAudioFormat(firstBytes, filePath);
        if (!detected) {
          console.warn(`Format check failed for .${ext} file. Aborting.`);
          return { ok: false, error: 'UNSUPPORTED_AUDIO_FORMAT' };
        }
        console.log(`Format detected: ${detected}. Proceeding with full download.`);
      } catch (rangeErr) {
        console.error('Failed to perform range check, falling back to full download:', rangeErr.message);
      }
    }

    const audioRes = await fetch(fileUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
    if (!audioRes.ok) {
      return { ok: false, error: `Telegram file download HTTP status ${audioRes.status}` };
    }
    const audioBuffer = new Uint8Array(await audioRes.arrayBuffer());

    let finalAudioData = audioBuffer;
    const detectedFormat = detectAudioFormat(audioBuffer, filePath);
    let wasConverted = false;

    console.log(`Format detection: ext=.${ext}, sig=${detectedFormat ?? 'none (native container or unknown)'}`);
    
    if (detectedFormat === 'aac') {
      console.log(`Detected raw ADTS-AAC stream (ext: .${ext}), wrapping in WAV (0x1600)...`);
      try {
        finalAudioData = wrapAacInWav(audioBuffer);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error('Failed to wrap AAC in WAV:', wrapErr.message);
      }
    } else if (detectedFormat === 'caf') {
      console.log(`Detected Apple CAF stream (ext: .${ext}), converting to WAV (0x1600)...`);
      try {
        finalAudioData = wrapCafInWav(audioBuffer);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error('Failed to wrap CAF in WAV:', wrapErr.message);
      }
    } else if (detectedFormat === 'amr-nb' || detectedFormat === 'amr-wb') {
      console.log(`Detected AMR stream (format: ${detectedFormat}), wrapping in WAV...`);
      try {
        const headerLen = detectedFormat === 'amr-nb' ? 6 : 9;
        const rawData = audioBuffer.subarray(headerLen);
        finalAudioData = wrapRawAudioInWav(rawData, detectedFormat);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error(`Failed to wrap ${detectedFormat} in WAV:`, wrapErr.message);
      }
    } else if (detectedFormat === 'gsm' || detectedFormat === 'alaw' || detectedFormat === 'mulaw') {
      console.log(`Detected raw audio stream (format: ${detectedFormat}), wrapping in WAV...`);
      try {
        finalAudioData = wrapRawAudioInWav(audioBuffer, detectedFormat);
        ext = 'wav';
        wasConverted = true;
      } catch (wrapErr) {
        console.error(`Failed to wrap ${detectedFormat} in WAV:`, wrapErr.message);
      }
    } else if (!NATIVE_EXTENSIONS.includes(ext.toLowerCase())) {
      console.warn(`Format .${ext} is unsupported and cannot be converted.`);
      return { ok: false, error: 'UNSUPPORTED_AUDIO_FORMAT' };
    }

    // Determine correct MIME type
    let mimeType = 'audio/ogg';
    if (ext === 'mp3' || ext === 'mpeg' || ext === 'mpga') mimeType = 'audio/mpeg';
    else if (ext === 'm4a' || ext === 'mp4') mimeType = 'audio/mp4';
    else if (ext === 'webm') mimeType = 'audio/webm';
    else if (ext === 'wav') mimeType = 'audio/wav';
    else if (ext === 'flac') mimeType = 'audio/flac';

    const formData = new FormData();
    const fileBlob = new Blob([finalAudioData], { type: mimeType });
    formData.append('file', fileBlob, `audio.${ext}`);
    formData.append('model', whisperModel);
    // verbose_json adds per-segment confidence used to drop silence/noise hallucinations;
    // only Whisper models support it on OpenAI-compatible APIs
    formData.append('response_format', /whisper/i.test(whisperModel) ? 'verbose_json' : 'json');

    if (whisperLanguage && whisperLanguage !== 'auto') {
      formData.append('language', whisperLanguage);
    }
    if (whisperPrompt) {
      formData.append('prompt', whisperPrompt);
    }

    const transcriptionUrl = apiBase.endsWith('/audio/transcriptions')
      ? apiBase
      : `${apiBase.replace(/\/$/, '')}/audio/transcriptions`;

    const whisperStart = Date.now();
    const timeoutMs = config.transcribeTimeout || TRANSCRIBE_TIMEOUT;
    const apiRes = await fetch(transcriptionUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const whisperDurationSec = ((Date.now() - whisperStart) / 1000).toFixed(1);

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      return { ok: false, error: `Transcription API HTTP ${apiRes.status}: ${errorText}` };
    }

    const transcription = await apiRes.json();
    if (!transcription.text) {
      return { ok: false, error: `Transcription API returned empty response: ${JSON.stringify(transcription)}` };
    }

    let rawText = transcription.text;
    let segments = transcription.segments;
    if (Array.isArray(segments) && segments.length && ext === 'ogg' && !wasConverted) {
      const repaired = await repairLostSegments(finalAudioData, segments, { transcriptionUrl, apiKey, model: whisperModel, language: whisperLanguage });
      if (repaired) {
        segments = repaired;
        rawText = repaired.map(seg => seg.text.trim()).join(' ');
      }
    }

    const processedText = formatParagraphs(rawText);
    const quality = assessTranscription(rawText, segments);

    return { 
      ok: true, 
      text: processedText, 
      quality,
      actualFormat: ext,
      signatureFormat: detectedFormat,
      wasConverted,
      whisperDuration: whisperDurationSec,
      model: whisperModel,
      language: whisperLanguage || 'auto'
    };
  } catch (e) {
    return { ok: false, error: `Internal transcription exception: ${e.message || e}` };
  }
}

/**
 * Check if the given MIME type and/or filename represents an unsupported video container (MOV, MKV, AVI, etc.)
 */
export function isUnsupportedVideoFile(mime, name) {
  // If it has a video MIME type, it must be either video/mp4 or video/webm.
  // Any other video MIME type (like video/quicktime, video/x-matroska, etc.) is unsupported.
  if (mime && mime.startsWith('video/')) {
    if (mime !== 'video/mp4' && mime !== 'video/webm') {
      return true;
    }
  }

  // If the filename has an extension, and it's one of the known unsupported video formats, reject it.
  if (name) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['mov', 'mkv', 'avi', '3gp', 'flv', 'wmv', 'm4v'].includes(ext)) {
      return true;
    }
  }

  return false;
}
