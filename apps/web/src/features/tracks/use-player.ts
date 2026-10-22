import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { audioUrlQueryOptions } from "./api"

export type Player = ReturnType<typeof usePlayer>

// The position is ours, not the media element's: seeking and the playhead keep working while
// the audio is still loading or has failed, and the element catches up once it has metadata.
export function usePlayer(trackId: string, durationMs: number) {
  const audioUrl = useQuery(audioUrlQueryOptions(trackId))
  const [audio] = useState(() => {
    const element = new Audio()
    element.preload = "metadata"
    return element
  })
  const positionRef = useRef(0)
  const retriedRef = useRef(false)
  const resumeRef = useRef(false)
  const refetchRef = useRef(audioUrl.refetch)
  refetchRef.current = audioUrl.refetch
  const [currentMs, setCurrentMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(false)

  const failed = mediaFailed || (audioUrl.isError && !audioUrl.data)
  const src = audioUrl.data?.url

  const setPosition = useCallback(
    (ms: number) => {
      const clamped = Math.min(durationMs, Math.max(0, Math.round(ms)))
      positionRef.current = clamped
      setCurrentMs(clamped)
      return clamped
    },
    [durationMs],
  )

  useEffect(() => {
    const on = {
      loadedmetadata: () => {
        setReady(true)
        audio.currentTime = positionRef.current / 1000
        if (resumeRef.current) {
          resumeRef.current = false
          audio.play().catch(() => {})
        }
      },
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      ended: () => setPlaying(false),
      waiting: () => setWaiting(true),
      playing: () => setWaiting(false),
      canplay: () => setWaiting(false),
      error: async () => {
        const wasPlaying = !audio.paused
        setPlaying(false)
        setWaiting(false)
        // The signed URL may have expired: ask for a fresh one once before giving up.
        if (retriedRef.current) {
          resumeRef.current = false
          setMediaFailed(true)
          return
        }
        retriedRef.current = true
        // A fresh link can point at another file (the preview): carry on from the same spot.
        resumeRef.current = wasPlaying
        const result = await refetchRef.current()
        if (result.isError) {
          resumeRef.current = false
          setMediaFailed(true)
        }
      },
    }
    for (const [name, handler] of Object.entries(on)) {
      audio.addEventListener(name, handler)
    }
    return () => {
      for (const [name, handler] of Object.entries(on)) {
        audio.removeEventListener(name, handler)
      }
      audio.pause()
    }
  }, [audio])

  // Every fetch reloads, even when it returns the same URL (local storage).
  const fetchedAt = audioUrl.dataUpdatedAt
  useEffect(() => {
    if (!src || !fetchedAt) return
    setReady(false)
    audio.src = src
    audio.load()
  }, [audio, src, fetchedAt])

  useEffect(() => () => audio.removeAttribute("src"), [audio])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      setPosition(audio.currentTime * 1000)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [audio, playing, setPosition])

  const seek = useCallback(
    (ms: number) => {
      const next = setPosition(ms)
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        audio.currentTime = next / 1000
      }
    },
    [audio, setPosition],
  )

  const toggle = useCallback(() => {
    if (failed) return
    if (audio.paused) {
      // A rejected play() (source failing, interrupted by a pause) surfaces through the
      // element's own error event.
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [audio, failed])

  const retry = useCallback(() => {
    retriedRef.current = false
    resumeRef.current = false
    setMediaFailed(false)
    void refetchRef.current()
  }, [])

  return {
    currentMs,
    durationMs,
    playing,
    buffering: !failed && (!ready || waiting),
    failed,
    seek,
    toggle,
    retry,
  }
}

const TYPING = "input, textarea, select, [contenteditable]"
const ACTIVATES_ON_SPACE = 'button, a, [role="checkbox"], [role="menuitem"]'

// Space plays and pauses, unless focus is somewhere Space already means something.
export function useSpaceToggle(toggle: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented)
        return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (
        target instanceof Element &&
        (target.closest(TYPING) ||
          target.closest(ACTIVATES_ON_SPACE) ||
          target.closest('[role="dialog"], [role="alertdialog"]'))
      ) {
        return
      }
      event.preventDefault()
      toggle()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggle])
}
