import fs from "fs/promises";
import { InvalidFileError } from "../errors.js";

// ─── Bitrate tables (kbps) ────────────────────────────────────────────────────

// Indexed as BITRATES[mpegVersionBits][layerBits][bitrateIndex]
// mpegVersionBits: 0=MPEG2.5, 2=MPEG2, 3=MPEG1
// layerBits:       1=Layer III, 2=Layer II, 3=Layer I  (from spec's bit values)
const BITRATES: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>> = [
  // MPEG 2.5
  [
    [], // 0 – reserved layer
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // L3
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // L2
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // L1
  ],
  // 1 – reserved (invalid)
  [[], [], [], []],
  // MPEG 2
  [
    [],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // L3
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // L2
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // L1
  ],
  // MPEG 1
  [
    [],
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // L3
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], // L2
    [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // L1
  ],
];

// Sample rates in Hz, indexed by [mpegVersionBits][sampleRateIndex]
const SAMPLE_RATES: ReadonlyArray<ReadonlyArray<number>> = [
  [11025, 12000, 8000], // MPEG 2.5
  [0, 0, 0], // reserved
  [22050, 24000, 16000], // MPEG 2
  [44100, 48000, 32000], // MPEG 1
];

// Samples per frame, indexed by [mpegVersionBits][layerBits]
const SAMPLES_PER_FRAME: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 576, 1152, 384], // MPEG 2.5: L3=576, L2=1152, L1=384
  [0, 0, 0, 0], // reserved
  [0, 576, 1152, 384], // MPEG 2
  [0, 1152, 1152, 384], // MPEG 1: L3=1152, L2=1152, L1=384
];

// ─── ID3v2 ────────────────────────────────────────────────────────────────────

/** Decode a 4-byte syncsafe integer (7 bits per byte). */
function decodeSyncsafe(buf: Buffer, offset: number): number {
  return (
    ((buf[offset] & 0x7f) << 21) |
    ((buf[offset + 1] & 0x7f) << 14) |
    ((buf[offset + 2] & 0x7f) << 7) |
    (buf[offset + 3] & 0x7f)
  );
}

/** Return the number of bytes occupied by an ID3v2 tag, or 0 if none present. */
function id3v2TagSize(buf: Buffer): number {
  if (buf.length < 10) return 0;
  if (buf.toString("ascii", 0, 3) !== "ID3") return 0;
  const tagBodySize = decodeSyncsafe(buf, 6);
  // ID3v2 header is 10 bytes; optionally followed by a 10-byte footer
  const hasFooter = (buf[5] & 0x10) !== 0;
  return 10 + tagBodySize + (hasFooter ? 10 : 0);
}

// ─── Frame header ─────────────────────────────────────────────────────────────

interface FrameInfo {
  mpegVersionBits: number;
  layerBits: number;
  bitrate: number; // kbps
  sampleRate: number; // Hz
  padding: number; // 0 or 1
  channelMode: number; // 0=stereo, 1=joint, 2=dual, 3=mono
  samplesPerFrame: number;
  frameSize: number; // bytes
}

/**
 * Parse an MPEG audio frame header starting at `offset`.
 * Returns `null` if the bytes do not form a valid header.
 */
function parseFrameHeader(buf: Buffer, offset: number): FrameInfo | null {
  if (offset + 4 > buf.length) return null;

  // Sync word: first 11 bits must all be 1
  if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) return null;

  const b1 = buf[offset + 1];
  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];

  const mpegVersionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  const bitrateIdx = (b2 >> 4) & 0x0f;
  const sampleRateIdx = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;
  const channelMode = (b3 >> 6) & 0x03;

  // Reject reserved / invalid values
  if (mpegVersionBits === 1) return null; // reserved version
  if (layerBits === 0) return null; // reserved layer
  if (bitrateIdx === 0 || bitrateIdx === 0x0f) return null; // free / bad bitrate
  if (sampleRateIdx === 0x03) return null; // reserved sample rate

  const bitrate = BITRATES[mpegVersionBits]?.[layerBits]?.[bitrateIdx];
  const sampleRate = SAMPLE_RATES[mpegVersionBits]?.[sampleRateIdx];
  const samplesPerFrame = SAMPLES_PER_FRAME[mpegVersionBits]?.[layerBits];

  if (!bitrate || !sampleRate || !samplesPerFrame) return null;

  // Frame size in bytes
  let frameSize: number;
  if (layerBits === 3) {
    // Layer I uses 12-sample slots × 4 bytes
    frameSize = (Math.floor((12 * bitrate * 1000) / sampleRate) + padding) * 4;
  } else {
    // Layer II / III
    frameSize = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
  }

  return {
    mpegVersionBits,
    layerBits,
    bitrate,
    sampleRate,
    padding,
    channelMode,
    samplesPerFrame,
    frameSize,
  };
}

/**
 * Scan `buf` starting at `startOffset` for the first valid MPEG frame header.
 * Returns `{ frame, offset }` or `null` if none is found.
 */
function findFirstFrame(
  buf: Buffer,
  startOffset: number
): { frame: FrameInfo; offset: number } | null {
  for (let i = startOffset; i < buf.length - 4; i++) {
    const frame = parseFrameHeader(buf, i);
    if (frame !== null) return { frame, offset: i };
  }
  return null;
}

// ─── VBR headers ─────────────────────────────────────────────────────────────

/**
 * Byte offset from frame start to the side-information area
 * where the Xing / Info header lives (right after the 4-byte frame header).
 */
function xingPayloadOffset(frame: FrameInfo, frameOffset: number): number {
  const isMono = frame.channelMode === 3;
  if (frame.mpegVersionBits === 3) {
    // MPEG 1: side info is 32 bytes (stereo) or 17 bytes (mono)
    return frameOffset + 4 + (isMono ? 17 : 32);
  }
  // MPEG 2 / 2.5: side info is 17 bytes (stereo) or 9 bytes (mono)
  return frameOffset + 4 + (isMono ? 9 : 17);
}

/**
 * Try to extract total frame count from a Xing / Info header.
 * Returns `null` if no such header is present.
 */
function readXingFrameCount(
  buf: Buffer,
  frame: FrameInfo,
  frameOffset: number
): number | null {
  const xingOffset = xingPayloadOffset(frame, frameOffset);
  if (xingOffset + 12 > buf.length) return null;

  const tag = buf.toString("ascii", xingOffset, xingOffset + 4);
  if (tag !== "Xing" && tag !== "Info") return null;

  const flags = buf.readUInt32BE(xingOffset + 4);
  if (!(flags & 0x01)) return null; // frame count field not present

  const totalFrames = buf.readUInt32BE(xingOffset + 8);
  return totalFrames > 0 ? totalFrames : null;
}

/**
 * Try to extract total frame count from a VBRI header (Fraunhofer encoder).
 * The VBRI header always sits 36 bytes after the frame start.
 */
function readVbriFrameCount(
  buf: Buffer,
  frameOffset: number
): number | null {
  const vbriOffset = frameOffset + 4 + 32; // always 36 bytes from frame start
  if (vbriOffset + 18 > buf.length) return null;

  if (buf.toString("ascii", vbriOffset, vbriOffset + 4) !== "VBRI") return null;

  const totalFrames = buf.readUInt32BE(vbriOffset + 14);
  return totalFrames > 0 ? totalFrames : null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Bytes to read from the beginning to locate frame headers and VBR info. */
const HEADER_READ_SIZE = 10_240;

export async function parseMp3(filePath: string): Promise<number> {
  const fh = await fs.open(filePath, "r");
  try {
    const { size: fileSize } = await fh.stat();
    const readSize = Math.min(HEADER_READ_SIZE, fileSize);
    const buf = Buffer.alloc(readSize);
    await fh.read(buf, 0, readSize, 0);

    // Skip any leading ID3v2 tag
    const audioStart = id3v2TagSize(buf);

    const result = findFirstFrame(buf, audioStart);
    if (result === null) {
      throw new InvalidFileError("Could not locate a valid MPEG frame header");
    }
    const { frame, offset: frameOffset } = result;

    // 1. Xing / Info VBR header
    const xingFrames = readXingFrameCount(buf, frame, frameOffset);
    if (xingFrames !== null) {
      return (xingFrames * frame.samplesPerFrame) / frame.sampleRate;
    }

    // 2. VBRI header (Fraunhofer)
    const vbriFrames = readVbriFrameCount(buf, frameOffset);
    if (vbriFrames !== null) {
      return (vbriFrames * frame.samplesPerFrame) / frame.sampleRate;
    }

    // 3. CBR estimation: audio bytes ÷ bytes-per-second
    //    Subtract any trailing ID3v1 tag (always 128 bytes starting with "TAG")
    const audioBytes = fileSize - frameOffset - (await hasId3v1Tag(fh) ? 128 : 0);
    return (audioBytes * 8) / (frame.bitrate * 1000);
  } finally {
    await fh.close();
  }
}

async function hasId3v1Tag(fh: fs.FileHandle): Promise<boolean> {
  const { size } = await fh.stat();
  if (size < 128) return false;
  const buf = Buffer.alloc(3);
  await fh.read(buf, 0, 3, size - 128);
  return buf.toString("ascii") === "TAG";
}
