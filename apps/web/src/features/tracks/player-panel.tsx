import type { Note } from "@repo/shared/schemas"
import {
  CircleAlert,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
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
  const zoomStep = (step: 1 | -1) => {
    const next = Math.min(levels.length - 1, Math.max(0, level + step))
    if (next === level) return false
    setLevel(next)
    return true
  }

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
        onZoomStep={zoomStep}
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
        {player.volumeSupported && <VolumeControl player={player} />}
        <Button
          variant="icon"
          size="icon"
          aria-label="Zoom out"
          disabled={level === 0}
          onClick={() => zoomStep(-1)}
        >
          <ZoomOut />
        </Button>
        <Button
          variant="icon"
          size="icon"
          aria-label="Zoom in"
          disabled={level >= levels.length - 1}
          onClick={() => zoomStep(1)}
        >
          <ZoomIn />
        </Button>
      </div>
    </div>
  )
}

function VolumeControl({ player }: { player: Player }) {
  const Icon =
    player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2
  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Phones have volume keys, and the row has no room for it beside the time. */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volume"
          className="hidden sm:inline-flex"
        >
          <Icon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-auto flex-row items-center gap-1 rounded-full py-0 pr-5 pl-1"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={player.volume === 0 ? "Unmute" : "Mute"}
          onClick={player.toggleMute}
        >
          <Icon />
        </Button>
        <Slider
          className="w-32"
          thumbLabel="Volume"
          min={0}
          max={1}
          step={0.01}
          value={[player.volume]}
          onValueChange={([value]) => player.setVolume(value ?? 0)}
        />
      </PopoverContent>
    </Popover>
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
