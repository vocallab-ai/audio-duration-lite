export class UnsupportedFormatError extends Error {
    constructor(extension) {
        super(`Unsupported audio format: "${extension}". ` +
            `Supported formats: .wav, .mp3, .flac, .ogg, .oga`);
        this.name = "UnsupportedFormatError";
        this.extension = extension;
    }
}
export class InvalidFileError extends Error {
    constructor(message) {
        super(message);
        this.name = "InvalidFileError";
    }
}
//# sourceMappingURL=errors.js.map