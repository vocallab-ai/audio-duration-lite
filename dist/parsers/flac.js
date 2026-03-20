import fs from "fs/promises";
import { InvalidFileError } from "../errors.js";
// FLAC stream marker (4) + metadata block header (4) + STREAMINFO data (34) = 42 bytes
const STREAMINFO_READ_SIZE = 42;
// STREAMINFO data block layout (34 bytes, bit-packed):
//   [0-1]   min block size (16 bits)
//   [2-3]   max block size (16 bits)
//   [4-6]   min frame size (24 bits)
//   [7-9]   max frame size (24 bits)
//   [10-12] sample rate (20 bits), channels-1 (3 bits), bps-1 MSB (1 bit)
//   [13]    bps-1 bits [3:0] (4 bits), total samples bits [35:32] (4 bits)
//   [14-17] total samples bits [31:0]
//   [18-33] MD5 signature (128 bits)
function parseStreamInfo(data) {
    // Sample rate: top nibble of data[12] holds bits [3:0], data[10] and data[11] hold bits [19:4]
    const sampleRate = (data[10] << 12) | (data[11] << 4) | ((data[12] >> 4) & 0x0f);
    if (sampleRate === 0) {
        throw new InvalidFileError("FLAC STREAMINFO contains an invalid sample rate of 0");
    }
    // Total samples: 4 bits from data[13] (high) + 32 bits from data[14..17] (low)
    const totalSamplesHi = data[13] & 0x0f;
    const totalSamplesLo = data[14] * 0x1000000 +
        data[15] * 0x10000 +
        data[16] * 0x100 +
        data[17];
    // Combine safely within JavaScript's 53-bit integer precision
    // Max 36-bit value ≈ 6.87 × 10¹⁰; well within Number.MAX_SAFE_INTEGER
    const totalSamples = totalSamplesHi * 0x100000000 + totalSamplesLo;
    return { sampleRate, totalSamples };
}
export async function parseFlac(filePath) {
    const fh = await fs.open(filePath, "r");
    try {
        const buf = Buffer.alloc(STREAMINFO_READ_SIZE);
        const { bytesRead } = await fh.read(buf, 0, STREAMINFO_READ_SIZE, 0);
        if (bytesRead < STREAMINFO_READ_SIZE) {
            throw new InvalidFileError("File is too small to be a valid FLAC");
        }
        if (buf.toString("ascii", 0, 4) !== "fLaC") {
            throw new InvalidFileError("File does not start with FLAC stream marker");
        }
        // Metadata block header: bit 7 = last-block flag, bits [6:0] = block type
        const blockType = buf[4] & 0x7f;
        if (blockType !== 0) {
            throw new InvalidFileError(`Expected STREAMINFO (type 0) as first metadata block, got type ${blockType}`);
        }
        // STREAMINFO data begins at offset 8 (after 4-byte marker + 4-byte block header)
        const data = buf.subarray(8, 26); // only the 18 bytes we need
        const { sampleRate, totalSamples } = parseStreamInfo(data);
        if (totalSamples === 0) {
            throw new InvalidFileError("FLAC STREAMINFO reports 0 total samples");
        }
        return totalSamples / sampleRate;
    }
    finally {
        await fh.close();
    }
}
//# sourceMappingURL=flac.js.map