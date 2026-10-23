import type { Note } from "@repo/shared/schemas"
import { Ellipsis, Pencil, Trash2 } from "lucide-react"
import { useRef } from "react"
import { PersonAvatar } from "@/components/layout/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

export function TimeChip({
  ms,
  className,
}: {
  ms: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-primary-tint px-2.5 py-0.5 font-mono text-time text-primary-text tabular-nums",
        className,
      )}
    >
      {formatDuration(ms)}
    </span>
  )
}

// What the viewer may do to this note; the api enforces the same rules.
export type NoteControls = { edit: boolean; delete: boolean; done: boolean }

export function NoteRow({
  note,
  author,
  controls,
  active,
  editing,
  onSeek,
  onDoneChange,
  onEdit,
  onDelete,
}: {
  note: Note
  // Shown only on shared projects: "You" or the author's name.
  author?: string | undefined
  controls: NoteControls
  active: boolean
  editing: boolean
  onSeek: () => void
  onDoneChange: (done: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const time = formatDuration(note.timestampMs)
  // Edit opens once the menu has closed: the open menu traps focus, so the form couldn't
  // take it, and the closing menu mustn't pull it back to its trigger.
  const editingRef = useRef(false)
  return (
    <li
      data-active={active || undefined}
      className={cn(
        "flex items-start rounded-lg border bg-card transition-colors duration-150",
        active && "border-primary bg-primary-tint",
        editing && "border-ring",
      )}
    >
      <button
        type="button"
        onClick={onSeek}
        className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg py-3 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="sr-only">Play from </span>
        <TimeChip ms={note.timestampMs} className={cn(active && "bg-card")} />
        <span className="flex min-w-0 flex-col gap-1">
          {author !== undefined && (
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <PersonAvatar person={note.author} size="sm" />
              <span data-testid="note-author" className="truncate">
                {author}
              </span>
            </span>
          )}
          <span
            className={cn(
              "min-w-0 break-words whitespace-pre-wrap",
              note.done && "text-subtle-foreground line-through",
            )}
          >
            {author !== undefined && <span className="sr-only">: </span>}
            {note.text}
          </span>
        </span>
      </button>
      {note.done && (
        <Badge variant="success" className="mt-3.5 ml-2 hidden sm:inline-flex">
          Done
        </Badge>
      )}
      <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center">
        <Checkbox
          checked={note.done}
          disabled={!controls.done}
          // Read-only on others' notes; a faded tick would hide that it's done.
          className="disabled:data-checked:opacity-100"
          aria-label={`Done: note at ${time}`}
          onCheckedChange={(checked) => onDoneChange(checked === true)}
        />
      </div>
      {!(controls.edit || controls.delete) ? (
        // Keeps the done checkboxes in one column down the list.
        <div aria-hidden className="mr-1 size-11 shrink-0" />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 mr-1"
              aria-label={`More for note at ${time}`}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              if (!editingRef.current) return
              editingRef.current = false
              event.preventDefault()
              onEdit()
            }}
          >
            {controls.edit && (
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => {
                  editingRef.current = true
                }}
              >
                <Pencil />
                Edit
              </DropdownMenuItem>
            )}
            {controls.delete && (
              <DropdownMenuItem
                className="min-h-11"
                variant="destructive"
                onSelect={onDelete}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}
