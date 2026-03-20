export { UnsupportedFormatError, InvalidFileError } from "./errors.js";
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
export declare function getAudioDuration(filePath: string): Promise<number>;
//# sourceMappingURL=index.d.ts.map