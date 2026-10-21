import type { Note } from "@repo/shared/schemas"
import { CircleAlert, Pause, Play, ZoomIn, ZoomOut } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatDuration } from "@/lib/format"
import type { Player } from "./use-player"
import { Waveform, zoomLevels } from "./waveform"

export function PlayerPanel({
  player,
  peaks,
  notes,
}: {
  player: Player
  peaks: number[]
  notes: Note[]
}) {
  const levels = zoomLevels(player.durationMs)
  const [level, setLevel] = useState(0)
  const zoom = levels[level] ?? 1

  return (
    <div className="flex flex-col gap-3">
      <Waveform
        peaks={peaks}
        durationMs={player.durationMs}
        currentMs={player.currentMs}
        playing={player.playing}
        zoom={zoom}
        notes={notes}
        onSeek={player.seek}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="play"
          size="play"
          aria-label={player.playing ? "Pause" : "Play"}
          aria-busy={player.buffering || undefined}
          disabled={player.failed}
          onClick={player.toggle}
        >
          {player.buffering ? (
            <Spinner />
          ) : player.playing ? (
            <Pause className="fill-current" />
          ) : (
            <Play className="translate-x-0.5 fill-current" />
          )}
        </Button>
        <p className="font-mono text-time-lg tabular-nums">
          <span data-testid="current-time">
            {formatDuration(player.currentMs)}
          </span>
          <span className="text-muted-foreground">
            {" "}
            / {formatDuration(player.durationMs)}
          </span>
        </p>
        <span className="flex-1" />
        <Button
          variant="icon"
          size="icon"
          aria-label="Zoom out"
          disabled={level === 0}
          onClick={() => setLevel((l) => Math.max(0, l - 1))}
        >
          <ZoomOut />
        </Button>
        <Button
          variant="icon"
          size="icon"
          aria-label="Zoom in"
          disabled={level >= levels.length - 1}
          onClick={() => setLevel((l) => Math.min(levels.length - 1, l + 1))}
        >
          <ZoomIn />
        </Button>
      </div>
    </div>
  )
}

export function AudioFailedAlert({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Couldn't load the audio</AlertTitle>
        <AlertDescription>
          The waveform and notes still work. Check your connection and try
          again.
        </AlertDescription>
      </Alert>
      <Button
        variant="ghost"
        className="w-full sm:w-auto sm:self-start"
        onClick={onRetry}
      >
        Try again
      </Button>
    </div>
  )
}
