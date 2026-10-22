const BAR_COUNT = 96
const BAR_PITCH = 3
const WAVE_WIDTH = BAR_COUNT * BAR_PITCH - 1
const WAVE_HEIGHT = 72
const PLAYED_BARS = 38

// A fixed, made-up mix shape: a quiet intro, a louder chorus, a tail.
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const t = i / BAR_COUNT
  const envelope = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.15))
  const texture = 0.6 + 0.4 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45))
  return {
    x: i * BAR_PITCH,
    height: Math.max(6, Math.round(WAVE_HEIGHT * envelope * texture)),
  }
})

const MARKERS = [
  { bar: 14, done: true },
  { bar: 52, done: false },
  { bar: 77, done: false },
]

const NOTES = [
  { time: "1:24", text: "Vocal sits a touch loud in the chorus." },
  { time: "2:31", text: "Love this snare. Keep it." },
]

export function WaveformIllustration() {
  return (
    <div
      role="img"
      aria-label="A waveform with notes pinned to moments in a mix"
      className="flex w-full flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-5"
    >
      <div className="rounded-xl bg-card p-3 sm:p-4">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT + 16}`}
          className="block h-auto w-full"
        >
          {BARS.map(({ x, height }, i) => (
            <rect
              key={x}
              x={x}
              y={(WAVE_HEIGHT - height) / 2}
              width={2}
              height={height}
              rx={1}
              className={i < PLAYED_BARS ? "fill-wave-played" : "fill-wave"}
            />
          ))}
          <rect
            x={PLAYED_BARS * BAR_PITCH - 1.5}
            y={0}
            width={2}
            height={WAVE_HEIGHT}
            rx={1}
            className="fill-playhead"
          />
          {MARKERS.map(({ bar, done }) => (
            <circle
              key={bar}
              cx={bar * BAR_PITCH + 1}
              cy={WAVE_HEIGHT + 9}
              r={5}
              className={done ? "fill-marker-done" : "fill-marker"}
            />
          ))}
        </svg>
      </div>
      <ul aria-hidden className="flex flex-col gap-2">
        {NOTES.map(({ time, text }) => (
          <li
            key={time}
            className="flex items-start gap-3 rounded-lg border bg-card p-3"
          >
            <span className="shrink-0 rounded-full bg-primary-tint px-2.5 py-0.5 font-mono text-time text-primary-text tabular-nums">
              {time}
            </span>
            <span className="text-pretty">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
