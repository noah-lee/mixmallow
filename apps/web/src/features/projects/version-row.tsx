import type { TrackSummary } from "@repo/shared/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Ellipsis, Pencil, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { PersonAvatar } from "@/components/layout/user-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { httpStatus } from "@/lib/api"
import {
  formatBytes,
  formatDuration,
  formatShortDate,
  plural,
} from "@/lib/format"
import { removeTrack, useDeleteTrack, useRenameTrack } from "./api"
import { ConfirmDeleteDialog } from "./confirm-delete-dialog"
import { RenameDialog, type RenameResult } from "./rename-dialog"

export function noteSummary(track: TrackSummary): string {
  if (track.noteCount === 0) return "No notes"
  return `${plural(track.noteCount, "note")} · ${track.doneNoteCount} done`
}

// Without `canManage` (others' versions, for a collaborator) the row has no rename/delete
// menu but still opens the track.
export function VersionRow({
  track,
  onDeleted,
  canManage,
  uploadedBy,
}: {
  track: TrackSummary
  onDeleted: () => void
  canManage: boolean
  // Shown only on shared projects: "Uploaded by you" or "Uploaded by Sam".
  uploadedBy?: string | undefined
}) {
  const label = `v${track.version}`

  return (
    <li className="flex items-start rounded-xl border bg-card">
      <Link
        to="/app/projects/$projectId/tracks/$trackId"
        params={{ projectId: track.projectId, trackId: track.id }}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="mt-0.5 shrink-0 rounded-full bg-muted px-2.5 py-0.5 font-mono text-time font-semibold tabular-nums">
          {label}
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
      {canManage && (
        <VersionMenu track={track} label={label} onDeleted={onDeleted} />
      )}
    </li>
  )
}

function VersionMenu({
  track,
  label,
  onDeleted,
}: {
  track: TrackSummary
  label: string
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const rename = useRenameTrack(track.projectId)
  const remove = useDeleteTrack(track.projectId)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)

  const save = async (name: string): Promise<RenameResult> => {
    try {
      await rename.mutateAsync({ trackId: track.id, name })
      return "saved"
    } catch (err) {
      const status = httpStatus(err)
      if (status === 404) {
        void removeTrack(qc, track.projectId, track.id)
        return "gone"
      }
      if (status === 403) {
        toast.error(`You can't rename ${label}.`)
        return "gone"
      }
      return status === 400 ? "invalid" : "failed"
    }
  }

  const confirmDelete = () =>
    remove.mutate(track.id, {
      onSuccess: () => setDeleting(false),
      onError: (err) => {
        if (httpStatus(err) === 404) {
          setDeleting(false)
          void removeTrack(qc, track.projectId, track.id)
          return
        }
        if (httpStatus(err) === 403) {
          setDeleting(false)
          toast.error(`You can't delete ${label}.`)
          return
        }
        toast.error(`Couldn't delete ${label}. Try again.`)
      },
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={menuRef}
            variant="icon"
            size="icon"
            className="mt-2 mr-2"
            aria-label={`More for ${label}`}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="min-h-11"
            onSelect={() => setRenaming(true)}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={`Rename ${label}`}
        description="The file stays the same; only the name you see changes."
        currentName={track.name}
        onSave={save}
      />
      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={
          track.noteCount > 0
            ? `Delete ${label} and its ${plural(track.noteCount, "note")}?`
            : `Delete ${label}?`
        }
        pending={remove.isPending}
        onConfirm={confirmDelete}
        // A successful delete can unmount the row before the dialog closes.
        returnFocus={() =>
          menuRef.current ? menuRef.current.focus() : onDeleted()
        }
      />
    </>
  )
}
