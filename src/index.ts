import path from "path";
import { parseWav } from "./parsers/wav.js";
import { parseMp3 } from "./parsers/mp3.js";
import { parseFlac } from "./parsers/flac.js";
import { parseOgg } from "./parsers/ogg.js";
import { UnsupportedFormatError } from "./errors.js";

export { UnsupportedFormatError, InvalidFileError } from "./errors.js";

type Parser = (filePath: string) => Promise<number>;

const PARSERS: Readonly<Record<string, Parser>> = {
  ".wav": parseWav,
  ".mp3": parseMp3,
  ".flac": parseFlac,
  ".ogg": parseOgg,
  ".oga": parseOgg, // OGG audio alias
};

/**
 * Return the duration of an audio file in seconds.
 *
 * Supported formats: `.wav`, `.mp3`, `.flac`, `.ogg`, `.oga`
 *
 * @param filePath - Absolute or relative path to the audio file.
 * @returns Duration in seconds (fractional).
 * @throws {UnsupportedFormatError} When the file extension is not supported.
 * @throws {InvalidFileError} When the file cannot be parsed as the expected format.
 *
 * @example
 * const duration = await getAudioDuration("./sample.mp3");
 * console.log(duration); // 12.43
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  const ext = path.extname(filePath).toLowerCase();
  const parser = PARSERS[ext];

  if (parser === undefined) {
    throw new UnsupportedFormatError(ext || "(no extension)");
  }

  return parser(filePath);
}
