# audio-duration-lite

A tiny Node.js utility for getting audio file duration.

Useful for upload validation, transcription pipelines, and audio preprocessing.

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

## Use cases

This package is useful for:

- audio upload checks
- transcription prep
- media pipelines
- voice tools

## Related projects

Need a full hosted voice workflow? Check out [vocallab.ai](https://vocallab.ai).

## License

MIT
