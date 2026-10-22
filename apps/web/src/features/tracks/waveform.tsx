import type { Note } from "@repo/shared/schemas"
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

const BAR_PITCH = 3
// Markers closer than a touch target merge into one dot with a count.
const MARKER_TARGET = 44
const KEY_STEP_MS = 5000
// The scroller's px-3: content x 0 sits this far into the scroll area.
const PAD = 12
// Wheel distance per zoom level: one mouse notch, or a moderate trackpad pinch.
const WHEEL_STEP = 50

// One bar per 3px (2px bar, 1px gap), each the loudest peak in its slice of the track. Zoomed
// past the peaks' resolution, neighbouring bars repeat a peak rather than leaving gaps.
function barsPath(peaks: number[], width: number): string {
  const count = Math.max(1, Math.floor(width / BAR_PITCH))
  const n = peaks.length
  let d = ""
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * n) / count)
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / count))
    let peak = 0
    for (let p = start; p < end && p < n; p++)
      peak = Math.max(peak, peaks[p] ?? 0)
    const half = Math.max(0.04, peak / 255) * 46
    const x = i * BAR_PITCH + 1
    d += `M${x} ${50 - half}V${50 + half}`
  }
  return d
}

type Cluster = { ms: number; x: number; notes: Note[] }

function clusterMarkers(
  notes: Note[],
  durationMs: number,
  width: number,
): Cluster[] {
  const clusters: Cluster[] = []
  for (const note of notes) {
    const x = (note.timestampMs / durationMs) * width
    const last = clusters.at(-1)
    if (last && x - last.x < MARKER_TARGET) last.notes.push(note)
    else clusters.push({ ms: note.timestampMs, x, notes: [note] })
  }
  return clusters
}

function Bars({
  d,
  width,
  className,
}: {
  d: string
  width: number
  className: string
}) {
  return (
    <svg
      aria-hidden="true"
      width={width}
      viewBox={`0 0 ${width} 100`}
      preserveAspectRatio="none"
      className={cn("absolute inset-y-0 left-0 h-full", className)}
    >
      <path
        d={d}
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function Waveform({
  peaks,
  durationMs,
  currentMs,
  playing,
  zoom,
  notes,
  onSeek,
  onZoomStep,
}: {
  peaks: number[]
  durationMs: number
  currentMs: number
  playing: boolean
  zoom: number
  notes: Note[]
  onSeek: (ms: number) => void
  // Returns whether the zoom changed (false at either end).
  onZoomStep: (step: 1 | -1) => boolean
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: number; live: boolean } | null>(null)
  const [viewWidth, setViewWidth] = useState(0)

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const observer = new ResizeObserver(() =>
      setViewWidth(scroller.clientWidth),
    )
    observer.observe(scroller)
    setViewWidth(scroller.clientWidth)
    return () => observer.disconnect()
  }, [])

  const width = Math.max(0, viewWidth - 24) * zoom
  const d = useMemo(() => barsPath(peaks, width), [peaks, width])
  const clusters = useMemo(
    () => clusterMarkers(notes, durationMs, width),
    [notes, durationMs, width],
  )
  const playheadX = durationMs > 0 ? (currentMs / durationMs) * width : 0

  // Across a zoom change, keep the moment under the cursor (wheel zoom) or the playhead
  // (buttons) where it was on screen.
  const anchorRef = useRef<{ ms: number; offset: number } | null>(null)
  const prevWidth = useRef(width)
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || prevWidth.current === width) return
    prevWidth.current = width
    const anchor = anchorRef.current
    anchorRef.current = null
    scroller.scrollLeft = anchor
      ? PAD + (anchor.ms / durationMs) * width - anchor.offset
      : playheadX - scroller.clientWidth / 2
  }, [width, playheadX, durationMs])

  // The native scrollbar is hidden (it looks different in every browser); this mirrors it.
  const [thumb, setThumb] = useState({ start: 0, size: 1 })
  const syncThumb = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller || scroller.scrollWidth === 0) return
    const total = scroller.scrollWidth
    setThumb({
      start: scroller.scrollLeft / total,
      size: scroller.clientWidth / total,
    })
  }, [])
  useLayoutEffect(syncThumb, [syncThumb, width])

  // While playing zoomed in, turn the page when the playhead runs off screen.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || !playing || zoom === 1) return
    const left = scroller.scrollLeft
    const visible = scroller.clientWidth - 24
    if (playheadX < left || playheadX > left + visible) {
      scroller.scrollLeft = playheadX - visible * 0.1
    }
  }, [playheadX, playing, zoom])

  const msAt = (clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * durationMs
  }

  // Mouse and unzoomed touch drags scrub. Zoomed, a touch drag pans the scroller instead
  // (the browser cancels the pointer), and only a tap seeks.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const live = event.pointerType !== "touch" || zoom === 1
    dragRef.current = { id: event.pointerId, live }
    if (live) {
      event.currentTarget.setPointerCapture(event.pointerId)
      onSeek(msAt(event.clientX))
    }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag?.id === event.pointerId && drag.live) onSeek(msAt(event.clientX))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== event.pointerId) return
    dragRef.current = null
    onSeek(msAt(event.clientX))
  }

  // Ctrl/Cmd + wheel (and trackpad pinch, which arrives as one) zooms; a plain wheel still
  // scrolls the page. React's onWheel is passive, so it couldn't stop the browser zooming.
  const wheelRef = useRef(0)
  const onWheelRef = useRef<(event: WheelEvent) => void>(() => {})
  onWheelRef.current = (event) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? window.innerHeight
          : 1
    const delta = event.deltaY * unit
    if (Math.sign(delta) !== Math.sign(wheelRef.current)) wheelRef.current = 0
    wheelRef.current += delta
    if (Math.abs(wheelRef.current) < WHEEL_STEP) return
    const step = wheelRef.current < 0 ? 1 : -1
    wheelRef.current = 0
    const scroller = scrollerRef.current
    if (!scroller) return
    const anchor = {
      ms: msAt(event.clientX),
      offset: event.clientX - scroller.getBoundingClientRect().left,
    }
    if (onZoomStep(step)) anchorRef.current = anchor
  }
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const onWheel = (event: WheelEvent) => onWheelRef.current(event)
    scroller.addEventListener("wheel", onWheel, { passive: false })
    return () => scroller.removeEventListener("wheel", onWheel)
  }, [])

  const barRef = useRef<HTMLDivElement>(null)
  const barDragRef = useRef<{
    id: number
    startX: number
    startScroll: number
  } | null>(null)
  // Pressing the bar off the thumb centres the view there; dragging then pans from it.
  const onBarPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current
    const rect = barRef.current?.getBoundingClientRect()
    if (event.button !== 0 || !scroller || !rect) return
    const ratio = (event.clientX - rect.left) / rect.width
    if (ratio < thumb.start || ratio > thumb.start + thumb.size) {
      scroller.scrollLeft =
        ratio * scroller.scrollWidth - scroller.clientWidth / 2
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    barDragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startScroll: scroller.scrollLeft,
    }
  }
  const onBarPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = barDragRef.current
    const scroller = scrollerRef.current
    const rect = barRef.current?.getBoundingClientRect()
    if (drag?.id !== event.pointerId || !scroller || !rect) return
    scroller.scrollLeft =
      drag.startScroll +
      ((event.clientX - drag.startX) / rect.width) * scroller.scrollWidth
  }
  const onBarPointerEnd = () => {
    barDragRef.current = null
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = {
      ArrowLeft: currentMs - KEY_STEP_MS,
      ArrowRight: currentMs + KEY_STEP_MS,
      Home: 0,
      End: durationMs,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    onSeek(next)
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className={cn(
          "relative h-32 overflow-x-auto overflow-y-hidden rounded-xl bg-surface px-3 [scrollbar-width:none] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring md:h-36 lg:h-44 [&::-webkit-scrollbar]:hidden",
          zoom === 1 && "overflow-x-hidden",
        )}
        onScroll={syncThumb}
      >
        {/* The keyboard and screen-reader way to seek; pointers use the panel itself. */}
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={durationMs}
          step="any"
          value={currentMs}
          aria-valuetext={`${formatDuration(currentMs)} of ${formatDuration(durationMs)}`}
          className="sr-only"
          onChange={(event) => onSeek(Number(event.target.value))}
          onKeyDown={onKeyDown}
        />
        <div
          ref={contentRef}
          data-waveform
          data-zoom={zoom}
          className={cn(
            "relative flex h-full cursor-pointer flex-col",
            zoom === 1 ? "touch-pan-y" : "touch-auto",
          )}
          style={{ width }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragRef.current = null
          }}
        >
          <div className="relative mt-3 flex-1">
            <Bars d={d} width={width} className="stroke-wave" />
            <div
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: playheadX }}
            >
              <Bars d={d} width={width} className="stroke-wave-played" />
            </div>
            <div
              data-playhead
              className="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-playhead"
              style={{ left: playheadX }}
            />
          </div>
          {/* Same action as tapping the note in the list, which is the keyboard path. */}
          <div aria-hidden="true" className="relative mb-3 h-5 shrink-0">
            {clusters.map((cluster) => {
              const done = cluster.notes.every((n) => n.done)
              const count = cluster.notes.length
              return (
                <button
                  key={cluster.notes[0]?.id}
                  type="button"
                  tabIndex={-1}
                  data-marker
                  data-count={count}
                  className="absolute top-1/2 flex size-11 -translate-1/2 items-center justify-center"
                  // Inset from the ends so a count badge and its hit area stay inside the panel.
                  style={{
                    left: Math.min(Math.max(cluster.x, 10), width - 10),
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={() => onSeek(cluster.ms)}
                >
                  {count === 1 ? (
                    <span
                      className={cn(
                        "size-3 rounded-full",
                        done ? "bg-marker-done" : "bg-marker",
                      )}
                    />
                  ) : (
                    <span
                      className={cn(
                        "flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-label text-background tabular-nums",
                        done ? "bg-marker-done" : "bg-marker",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {zoom > 1 && (
        // Pointer-only: keyboard and screen-reader users follow the playhead, which pages
        // the view along.
        <div
          ref={barRef}
          aria-hidden="true"
          data-scrollbar
          className="group absolute inset-x-3 bottom-0 h-3 cursor-pointer touch-none"
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerEnd}
          onPointerCancel={onBarPointerEnd}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/5" />
          <div
            data-scrollbar-thumb
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/20 transition-[height,background-color] duration-120 group-hover:h-1.5 group-hover:bg-foreground/35 group-active:h-1.5 group-active:bg-foreground/35"
            style={{
              left: `${thumb.start * 100}%`,
              width: `${thumb.size * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  )
}

// Doubling steps from the whole track up to about 4 seconds across the panel.
export function zoomLevels(durationMs: number): number[] {
  const levels = [1]
  while (levels.length < 8) {
    const next = (levels.at(-1) ?? 1) * 2
    if (durationMs / next < 4000) break
    levels.push(next)
  }
  return levels
}
