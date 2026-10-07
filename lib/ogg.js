// lib/ogg.js
// Cut a time range out of an Ogg Opus file (Telegram voice notes) without decoding:
// keep the header pages, copy the audio pages of the range, renumber them and rewrite CRCs.

const OPUS_RATE = 48000;

let crcTable = null;
function oggCrc(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
      crcTable[i] = r >>> 0;
    }
  }
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  return crc;
}

function parsePages(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const pages = [];
  let pos = 0;
  while (pos + 27 <= buf.length) {
    if (buf[pos] !== 0x4f || buf[pos + 1] !== 0x67 || buf[pos + 2] !== 0x67 || buf[pos + 3] !== 0x53) return null;
    const segments = buf[pos + 26];
    let bodyLength = 0;
    for (let i = 0; i < segments; i++) bodyLength += buf[pos + 27 + i];
    const length = 27 + segments + bodyLength;
    if (pos + length > buf.length) break;
    pages.push({
      offset: pos,
      length,
      flags: buf[pos + 5],
      granule: view.getBigInt64(pos + 6, true),
      // Last lacing value of 255 means the final packet continues on the next page
      continues: segments > 0 && buf[pos + 27 + segments - 1] === 255
    });
    pos += length;
  }
  return pages;
}

/**
 * Returns a standalone Ogg Opus file with the audio between startSec and endSec, or null
 * when the input is not a plain Ogg Opus stream.
 */
export function sliceOggOpus(input, startSec, endSec) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const pages = parsePages(buf);
  if (!pages || pages.length < 3) return null;
  const head = buf.subarray(pages[0].offset, pages[0].offset + pages[0].length);
  if (new TextDecoder().decode(head.subarray(27 + head[26], 27 + head[26] + 8)) !== 'OpusHead') return null;
  const preSkip = BigInt(head[27 + head[26] + 10] | (head[27 + head[26] + 11] << 8));

  // Header pages (OpusHead, OpusTags) carry granule 0 and come before any audio
  let firstAudio = 1;
  while (firstAudio < pages.length && pages[firstAudio].granule === 0n) firstAudio++;
  if (firstAudio >= pages.length) return null;

  const startGranule = BigInt(Math.max(0, Math.floor(startSec * OPUS_RATE))) + preSkip;
  const endGranule = BigInt(Math.ceil(endSec * OPUS_RATE)) + preSkip;

  const selected = [];
  let base = 0n;
  let previousGranule = 0n;
  for (let i = firstAudio; i < pages.length; i++) {
    const page = pages[i];
    const granule = page.granule;
    if (granule === -1n) {
      if (selected.length) selected.push(page);
      continue;
    }
    if (!selected.length) {
      // Start on a page whose first packet begins on it, after the requested start
      if (granule <= startGranule || (page.flags & 0x01)) { previousGranule = granule; continue; }
      base = previousGranule > preSkip ? previousGranule - preSkip : 0n;
    }
    selected.push(page);
    if (granule >= endGranule && !page.continues) break;
  }
  if (!selected.length) return null;

  const headerPages = pages.slice(0, firstAudio);
  const total = [...headerPages, ...selected].reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;
  let sequence = 0;
  for (const page of [...headerPages, ...selected]) {
    out.set(buf.subarray(page.offset, page.offset + page.length), pos);
    const isAudio = sequence >= headerPages.length;
    if (isAudio) {
      if (page.granule !== -1n) view.setBigInt64(pos + 6, page.granule - base, true);
      let flags = out[pos + 5] & ~0x04;
      if (page === selected[0]) flags &= ~0x01;
      if (page === selected[selected.length - 1]) flags |= 0x04;
      out[pos + 5] = flags;
    }
    view.setUint32(pos + 18, sequence, true);
    view.setUint32(pos + 22, 0, true);
    view.setUint32(pos + 22, oggCrc(out.subarray(pos, pos + page.length)), true);
    pos += page.length;
    sequence++;
  }
  return out;
}
