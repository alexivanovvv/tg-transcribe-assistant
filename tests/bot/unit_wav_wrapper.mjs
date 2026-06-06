import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdtsHeader,
  wrapCafInWav
} from '../../lib/wav-wrapper.js';

/**
 * Helper to build a valid minimal Apple CAF buffer containing AAC audio packets.
 */
function buildValidCafBuffer() {
  const descSize = 32;
  const paktHeaderSize = 24;
  const packetSize = 5;
  const paktSize = paktHeaderSize + 1; // 1 byte for varint packet size (5)
  const dataSize = 4 + packetSize; // 4 bytes editCount + 5 payload bytes

  const totalSize = 8 + (12 + descSize) + (12 + paktSize) + (12 + dataSize);
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // 1. CAF File Header (8 bytes)
  buf[0] = 0x63; buf[1] = 0x61; buf[2] = 0x66; buf[3] = 0x66; // "caff"
  view.setUint16(4, 1, false); // mFileVersion = 1
  view.setUint16(6, 0, false); // mFileFlags = 0

  let offset = 8;

  // 2. 'desc' Chunk
  buf[offset] = 0x64; buf[offset+1] = 0x65; buf[offset+2] = 0x73; buf[offset+3] = 0x63; // "desc"
  view.setBigInt64(offset + 4, BigInt(descSize), false);
  offset += 12;

  view.setFloat64(offset, 44100.0, false); // mSampleRate
  buf[offset + 8] = 0x61; buf[offset + 9] = 0x61; buf[offset + 10] = 0x63; buf[offset + 11] = 0x20; // "aac "
  view.setUint32(offset + 12, 0, false); // mFormatFlags
  view.setUint32(offset + 16, 0, false); // mBytesPerPacket
  view.setUint32(offset + 20, 1024, false); // mFramesPerPacket
  view.setUint32(offset + 24, 2, false); // mChannelsPerFrame
  view.setUint32(offset + 28, 0, false); // mBitsPerChannel
  offset += descSize;

  // 3. 'pakt' Chunk
  buf[offset] = 0x70; buf[offset+1] = 0x61; buf[offset+2] = 0x6B; buf[offset+3] = 0x74; // "pakt"
  view.setBigInt64(offset + 4, BigInt(paktSize), false);
  offset += 12;

  view.setBigInt64(offset, BigInt(1), false); // mNumberPackets = 1
  view.setBigInt64(offset + 8, BigInt(1024), false); // mNumberValidFrames
  view.setInt32(offset + 16, 0, false); // mPrimingFrames
  view.setInt32(offset + 20, 0, false); // mRemainderFrames
  buf[offset + 24] = packetSize; // varint packet size = 5
  offset += paktSize;

  // 4. 'data' Chunk
  buf[offset] = 0x64; buf[offset+1] = 0x61; buf[offset+2] = 0x74; buf[offset+3] = 0x61; // "data"
  view.setBigInt64(offset + 4, BigInt(dataSize), false);
  offset += 12;

  view.setUint32(offset, 0, false); // mEditCount
  buf.set([0x01, 0x02, 0x03, 0x04, 0x05], offset + 4); // 5 payload bytes

  return buf;
}

describe('Bot unit_wav_wrapper', () => {
  test('parseAdtsHeader error validation', () => {
    assert.throws(() => parseAdtsHeader(new Uint8Array([0xFF])), /too short/);
    assert.throws(() => parseAdtsHeader(new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])), /Invalid ADTS syncword/);
  });

  test('wrapCafInWav successfully wraps valid CAF AAC buffer into WAV container', () => {
    const cafBuf = buildValidCafBuffer();
    const wavBuf = wrapCafInWav(cafBuf);

    assert.equal(wavBuf[0], 0x52); // 'R'
    assert.equal(wavBuf[1], 0x49); // 'I'
    assert.equal(wavBuf[2], 0x46); // 'F'
    assert.equal(wavBuf[3], 0x46); // 'F'
    assert.equal(wavBuf[8], 0x57); // 'W'
    assert.equal(wavBuf[9], 0x41); // 'A'
    assert.equal(wavBuf[10], 0x56); // 'V'
    assert.equal(wavBuf[11], 0x45); // 'E'
  });

  test('wrapCafInWav error handling for corrupted/invalid CAF files', () => {
    // 1. Buffer too short
    assert.throws(() => wrapCafInWav(new Uint8Array([0x63, 0x61, 0x66])), /too short/);

    // 2. Not a valid 'caff' header
    assert.throws(() => wrapCafInWav(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00])), /Not a valid CAF file/);

    // 3. Missing desc chunk
    const noDescCaf = new Uint8Array([0x63, 0x61, 0x66, 0x66, 0x00, 0x01, 0x00, 0x00]);
    assert.throws(() => wrapCafInWav(noDescCaf), /Missing desc chunk/);

    // 4. Unsupported codec in desc chunk
    const cafWithDesc = new Uint8Array(52);
    const view = new DataView(cafWithDesc.buffer);
    cafWithDesc[0] = 0x63; cafWithDesc[1] = 0x61; cafWithDesc[2] = 0x66; cafWithDesc[3] = 0x66; // caff
    cafWithDesc[8] = 0x64; cafWithDesc[9] = 0x65; cafWithDesc[10] = 0x73; cafWithDesc[11] = 0x63; // desc
    view.setBigInt64(12, BigInt(32), false); // desc length = 32
    view.setFloat64(20, 44100.0, false);
    // Codec = "lpcm"
    cafWithDesc[28] = 0x6C; cafWithDesc[29] = 0x70; cafWithDesc[30] = 0x63; cafWithDesc[31] = 0x6D;
    assert.throws(() => wrapCafInWav(cafWithDesc), /Unsupported CAF codec: lpcm/);
  });
});
