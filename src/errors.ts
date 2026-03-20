export class UnsupportedFormatError extends Error {
  readonly extension: string;

  constructor(extension: string) {
    super(
      `Unsupported audio format: "${extension}". ` +
        `Supported formats: .wav, .mp3, .flac, .ogg, .oga`
    );
    this.name = "UnsupportedFormatError";
    this.extension = extension;
  }
}

export class InvalidFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFileError";
  }
}
