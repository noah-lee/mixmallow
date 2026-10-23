import type { TrackDetail } from "@repo/shared/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { Ellipsis, Pencil, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  projectKey,
  removeTrack,
  useDeleteTrack,
  useRenameTrack,
} from "@/features/projects/api"
import { ConfirmDeleteDialog } from "@/features/projects/confirm-delete-dialog"
import {
  RenameDialog,
  type RenameResult,
} from "@/features/projects/rename-dialog"
import { httpStatus } from "@/lib/api"
import { plural } from "@/lib/format"
import { setTrackName } from "./api"

export function TrackMenu({
  track,
  noteCount,
  onGone,
  onDeleted,
}: {
  track: TrackDetail
  noteCount: number
  onGone: () => void
  // Also called when the server says the version was already gone.
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const rename = useRenameTrack(track.projectId)
  const remove = useDeleteTrack(track.projectId)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  const label = `v${track.version}`
  // A 403 means this user's rights changed under the page; reload what decides the menu.
  const refetchRights = () =>
    void qc.invalidateQueries({ queryKey: projectKey(track.projectId) })

  const save = async (name: string): Promise<RenameResult> => {
    try {
      const renamed = await rename.mutateAsync({ trackId: track.id, name })
      setTrackName(qc, track.id, renamed.name)
      return "saved"
    } catch (err) {
      const status = httpStatus(err)
      if (status === 404) {
        onGone()
        return "gone"
      }
      if (status === 403) refetchRights()
      return status === 400 ? "invalid" : "failed"
    }
  }

  const confirmDelete = () =>
    remove.mutate(track.id, {
      onSuccess: onDeleted,
      onError: (err) => {
        if (httpStatus(err) === 404) {
          void removeTrack(qc, track.projectId, track.id)
          onDeleted()
          return
        }
        if (httpStatus(err) === 403) refetchRights()
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
            aria-label={`Options for ${label}`}
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
            Rename {label}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2 />
            Delete {label}
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
          noteCount > 0
            ? `Delete ${label} and its ${plural(noteCount, "note")}?`
            : `Delete ${label}?`
        }
        pending={remove.isPending}
        onConfirm={confirmDelete}
        returnFocus={() => menuRef.current?.focus()}
      />
    </>
  )
}
