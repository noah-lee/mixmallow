import { PEAKS_MAX } from "@repo/shared/schemas"

const PEAKS_PER_SECOND = 20

export type DecodedAudio = { durationMs: number; peaks: number[] }

// Decodes in the browser for the duration and a 0–255 peak per slice of time (loudest
// sample across channels), which the track page draws before any audio streams.
export async function decodeAudio(file: File): Promise<DecodedAudio> {
  const context = new OfflineAudioContext(1, 1, 44_100)
  const buffer = await context.decodeAudioData(await file.arrayBuffer())
  const durationMs = Math.max(1, Math.round(buffer.duration * 1000))
  const count = Math.min(
    PEAKS_MAX,
    Math.max(1, Math.ceil(buffer.duration * PEAKS_PER_SECOND)),
  )
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  )
  const slice = buffer.length / count
  const peaks: number[] = []
  for (let p = 0; p < count; p++) {
    const start = Math.floor(p * slice)
    const end = Math.max(start + 1, Math.floor((p + 1) * slice))
    let max = 0
    for (const data of channels) {
      for (let i = start; i < end && i < data.length; i++) {
        const v = Math.abs(data[i] ?? 0)
        if (v > max) max = v
      }
    }
    peaks.push(Math.min(255, Math.round(max * 255)))
  }
  return { durationMs, peaks }
}
