import fs from "fs/promises";
import { InvalidFileError } from "../errors.js";

// OGG page header layout:
//   [0-3]   capture pattern "OggS"
//   [4]     version (must be 0)
//   [5]     header type flags
//   [6-13]  granule position (int64 LE)
//   [14-17] stream serial number
//   [18-21] page sequence number
//   [22-25] CRC checksum
//   [26]    number of page segments
//   [27+n]  segment table (n bytes)

const OGG_CAPTURE = Buffer.from([0x4f, 0x67, 0x67, 0x53]); // "OggS"

const FIRST_READ_SIZE = 8_192; // enough for the Vorbis ID header in page 1
const TAIL_READ_SIZE = 65_536; // scan last 64 KiB for the final page

// ─── Vorbis identification header ────────────────────────────────────────────

// Vorbis packet layout (starts at the first packet in the first OGG page):
//   [0]    packet type (0x01 = identification)
//   [1-6]  "vorbis"
//   [7-10] vorbis version (LE uint32, must be 0)
//   [11]   audio channels
//   [12-15] audio sample rate (LE uint32)

function readVorbisSampleRate(buf: Buffer, pageOffset: number): number {
  const segCount = buf[pageOffset + 26];
  const packetOffset = pageOffset + 27 + segCount;

  if (packetOffset + 16 > buf.length) {
    throw new InvalidFileError("OGG first page is too small to contain a Vorbis ID header");
  }

  if (buf[packetOffset] !== 0x01) {
    throw new InvalidFileError(
      `Expected Vorbis identification packet (type 0x01), got 0x${buf[packetOffset].toString(16)}`
    );
  }

  if (buf.toString("ascii", packetOffset + 1, packetOffset + 7) !== "vorbis") {
    throw new InvalidFileError("OGG stream does not contain a Vorbis header");
  }

  const sampleRate = buf.readUInt32LE(packetOffset + 12);
  if (sampleRate === 0) {
    throw new InvalidFileError("Vorbis identification header contains a sample rate of 0");
  }

  return sampleRate;
}

// ─── Granule position ─────────────────────────────────────────────────────────

/**
 * Read a 64-bit LE granule position from an OGG page header at `pageOffset`.
 * JavaScript's 53-bit integer precision supports up to ~2^53 / sampleRate seconds,
 * which exceeds any practical audio file length at all common sample rates.
 */
function readGranulePosition(buf: Buffer, pageOffset: number): number {
  const lo = buf.readUInt32LE(pageOffset + 6);
  const hi = buf.readUInt32LE(pageOffset + 10);
  return hi * 0x100000000 + lo;
}

/**
 * Scan `buf` backwards for the last occurrence of the OGG capture pattern.
 * Returns the offset, or -1 if not found.
 */
function findLastOggPage(buf: Buffer): number {
  for (let i = buf.length - 4; i >= 0; i--) {
    if (
      buf[i] === OGG_CAPTURE[0] &&
      buf[i + 1] === OGG_CAPTURE[1] &&
      buf[i + 2] === OGG_CAPTURE[2] &&
      buf[i + 3] === OGG_CAPTURE[3]
    ) {
      return i;
    }
  }
  return -1;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function parseOgg(filePath: string): Promise<number> {
  const fh = await fs.open(filePath, "r");
  try {
    const { size: fileSize } = await fh.stat();

    // ── Step 1: read the first page and extract the sample rate ──────────────
    const firstReadSize = Math.min(FIRST_READ_SIZE, fileSize);
    const firstBuf = Buffer.alloc(firstReadSize);
    await fh.read(firstBuf, 0, firstReadSize, 0);

    if (firstBuf.toString("ascii", 0, 4) !== "OggS") {
      throw new InvalidFileError("File does not start with an OGG capture pattern");
    }
    if (firstBuf[4] !== 0) {
      throw new InvalidFileError(`Unsupported OGG stream version: ${firstBuf[4]}`);
    }

    const sampleRate = readVorbisSampleRate(firstBuf, 0);

    // ── Step 2: read the tail and locate the last OGG page ───────────────────
    const tailReadSize = Math.min(TAIL_READ_SIZE, fileSize);
    const tailBuf = Buffer.alloc(tailReadSize);
    await fh.read(tailBuf, 0, tailReadSize, fileSize - tailReadSize);

    const lastPageOffset = findLastOggPage(tailBuf);
    if (lastPageOffset === -1) {
      throw new InvalidFileError("Could not find last OGG page in file");
    }

    const granulePosition = readGranulePosition(tailBuf, lastPageOffset);

    // A granule position of -1 (all bits set) means "not determined" in the spec
    if (granulePosition === 0xffffffff * 0x100000000 + 0xffffffff) {
      throw new InvalidFileError("OGG last page has an indeterminate granule position");
    }

    return granulePosition / sampleRate;
  } finally {
    await fh.close();
  }
}
