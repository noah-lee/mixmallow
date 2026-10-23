import type { TrackSummary } from "@repo/shared/schemas"
import { Link } from "@tanstack/react-router"
import { PersonAvatar } from "@/components/layout/user-avatar"
import {
  formatBytes,
  formatDuration,
  formatShortDate,
  plural,
} from "@/lib/format"

export function noteSummary(track: TrackSummary): string {
  if (track.noteCount === 0) return "No notes"
  return `${plural(track.noteCount, "note")} · ${track.doneNoteCount} done`
}

// Rename and delete live on the track page, not here.
export function VersionRow({
  track,
  uploadedBy,
}: {
  track: TrackSummary
  // Shown only on shared projects: "Uploaded by you" or "Uploaded by Sam".
  uploadedBy?: string | undefined
}) {
  return (
    <li className="rounded-xl border bg-card">
      <Link
        to="/app/projects/$projectId/tracks/$trackId"
        params={{ projectId: track.projectId, trackId: track.id }}
        className="flex min-w-0 items-start gap-3 rounded-xl p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2.5 py-0.5 font-mono text-time font-semibold tabular-nums">
          v{track.version}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-semibold break-words">{track.name}</span>
          {uploadedBy !== undefined && (
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <PersonAvatar person={track.uploader} size="sm" />
              <span data-testid="version-uploader" className="truncate">
                {uploadedBy}
              </span>
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">
              {formatDuration(track.durationMs)}
            </span>{" "}
            · {formatBytes(track.sizeBytes)} · {track.format.toUpperCase()} ·{" "}
            {formatShortDate(track.createdAt)}
          </span>
          <span className="text-sm text-muted-foreground">
            {noteSummary(track)}
          </span>
        </span>
      </Link>
    </li>
  )
}
