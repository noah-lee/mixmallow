import { readFileSync } from 'node:fs';

// A short mono 16-bit PCM sine, small enough to decode instantly.
export function wav(seconds = 2, sampleRate = 8000): Buffer {
  const samples = seconds * sampleRate;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const v = Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 0.6;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

// A 2 s 440 Hz mono tone, encoded once with ffmpeg (Chromium can't be relied on for AAC/M4A).
export function mp3(): Buffer {
  return readFileSync(new URL('./tone.mp3', import.meta.url));
}
