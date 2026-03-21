# audio-duration-lite — Get Audio Duration in Node.js (MP3, WAV, etc.)

[![npm version](https://img.shields.io/npm/v/audio-duration-lite)](https://www.npmjs.com/package/audio-duration-lite)
[![types](https://img.shields.io/npm/types/audio-duration-lite)](https://www.npmjs.com/package/audio-duration-lite)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue)](https://www.typescriptlang.org/)
[![downloads](https://img.shields.io/npm/dm/audio-duration-lite)](https://www.npmjs.com/package/audio-duration-lite)
[![GitHub stars](https://img.shields.io/github/stars/vocallab-ai/audio-duration-lite)](https://github.com/vocallab-ai/audio-duration-lite)

Get the duration of audio files in Node.js and JavaScript.

Supports MP3, WAV, and other formats.  
Perfect for upload validation, transcription pipelines, and media processing.

If you're looking for a simple way to get audio length in Node.js — this package is for you.

## Features

- Tiny and focused
- Simple Promise-based API
- Great for backend scripts and media workflows

## Install

```bash
npm install audio-duration-lite
```

## Usage

```ts
import { getAudioDuration } from "audio-duration-lite";

const duration = await getAudioDuration("./sample.mp3");

console.log(duration); // 12.43
```

## API

### `getAudioDuration(filePath: string): Promise<number>`

Returns the duration of an audio file in seconds.

## Example

```ts
const duration = await getAudioDuration("./recording.wav");

if (duration > 30) {
  console.log("Audio is too long");
}
```

## Use Cases

- Validate uploaded audio length (e.g. limit to 30 seconds)
- Preprocess audio before transcription (OpenAI, Whisper, etc.)
- Build voice apps and audio tools
- Analyze media files in Node.js scripts
- Check duration before uploading to cloud storage


## Why audio-duration-lite?

- No heavy dependencies
- Faster than full audio processing libraries
- Minimal and focused API
- Perfect for simple duration checks

## Related

Looking for a full AI voice pipeline (generation + captions)?

👉 https://www.vocallab.ai


## License

MIT

## Keywords

- get audio duration nodejs
- get mp3 duration javascript
- audio length node js
- get wav duration node
- audio processing npm
