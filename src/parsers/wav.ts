import fs from "fs/promises";
import { InvalidFileError } from "../errors.js";

/** Maximum bytes to scan for RIFF chunks before giving up. */
const SCAN_LIMIT = 65536;

interface FmtChunk {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
}

/**
 * Scan a RIFF WAVE buffer for the "fmt " and "data" chunks.
 * Returns sample rate, channel count, bits per sample, and data size.
 */
function scanChunks(
  buf: Buffer,
  bytesRead: number
): { fmt: FmtChunk; dataSize: number } {
  let fmt: FmtChunk | null = null;
  let dataSize: number | null = null;

  let offset = 12; // skip "RIFF" (4) + file size (4) + "WAVE" (4)
  while (offset + 8 <= bytesRead) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      if (offset + 8 + 24 > bytesRead) {
        throw new InvalidFileError("WAV fmt chunk is truncated");
      }
      fmt = {
        numChannels: buf.readUInt16LE(offset + 10),
        sampleRate: buf.readUInt32LE(offset + 12),
        bitsPerSample: buf.readUInt16LE(offset + 22),
      };
    } else if (chunkId === "data") {
      dataSize = chunkSize;
    }

    if (fmt !== null && dataSize !== null) break;

    // Advance to next chunk; RIFF chunks must be word-aligned
    const advance = 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);
    if (advance === 0) break; // guard against malformed zero-size chunks
    offset += advance;
  }

  if (fmt === null) throw new InvalidFileError("WAV file is missing fmt chunk");
  if (dataSize === null)
    throw new InvalidFileError("WAV file is missing data chunk");

  return { fmt, dataSize };
}

export async function parseWav(filePath: string): Promise<number> {
  const fh = await fs.open(filePath, "r");
  try {
    const bufSize = Math.min(SCAN_LIMIT, (await fh.stat()).size);
    const buf = Buffer.alloc(bufSize);
    const { bytesRead } = await fh.read(buf, 0, bufSize, 0);

    if (bytesRead < 44) {
      throw new InvalidFileError("File is too small to be a valid WAV");
    }
    if (buf.toString("ascii", 0, 4) !== "RIFF") {
      throw new InvalidFileError("WAV file is missing RIFF header");
    }
    if (buf.toString("ascii", 8, 12) !== "WAVE") {
      throw new InvalidFileError("RIFF file is not a WAVE file");
    }

    const { fmt, dataSize } = scanChunks(buf, bytesRead);

    if (fmt.sampleRate === 0) {
      throw new InvalidFileError("WAV file has invalid sample rate of 0");
    }
    if (fmt.bitsPerSample === 0 || fmt.numChannels === 0) {
      throw new InvalidFileError("WAV file has invalid channel or bit-depth info");
    }

    const bytesPerSample = fmt.bitsPerSample / 8;
    const totalSamples = dataSize / (fmt.numChannels * bytesPerSample);
    return totalSamples / fmt.sampleRate;
  } finally {
    await fh.close();
  }
}
