import {
  NOTE_LIMIT_PER_TRACK,
  type Note,
  type Project,
  projectIdParamsSchema,
  type TrackDetail,
  type TrackSummary,
  trackIdParamsSchema,
  type UpdateNoteBody,
} from "@repo/shared/schemas"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ChevronLeft, CircleAlert, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/features/auth/api"
import { personName } from "@/features/members/person-name"
import { ShareButton } from "@/features/members/share-sheet"
import {
  PROJECTS_QUERY_KEY,
  projectQueryOptions,
  trackListQueryOptions,
} from "@/features/projects/api"
import {
  forgetTrack,
  notesQueryOptions,
  trackQueryOptions,
  useCreateNote,
  useDeleteNote,
  useNoteCache,
  useUpdateNote,
} from "@/features/tracks/api"
import {
  type NoteDraft,
  NoteForm,
  type NoteSaveResult,
} from "@/features/tracks/note-form"
import { type NoteControls, NoteRow } from "@/features/tracks/note-row"
import { AudioFailedAlert, PlayerPanel } from "@/features/tracks/player-panel"
import { TrackMenu } from "@/features/tracks/track-menu"
import { usePlayer, useSpaceToggle } from "@/features/tracks/use-player"
import { UploadIllustration } from "@/features/uploads/upload-illustration"
import { apiErrorCode, httpStatus, validationPaths } from "@/lib/api"
import { plural } from "@/lib/format"
import { useMediaQuery } from "@/lib/use-media-query"
import { cn } from "@/lib/utils"

export const Route = createFileRoute(
  "/_app/app/projects/$projectId/tracks/$trackId",
)({
  component: TrackPage,
})

const LIMIT_MESSAGE = `This version has the maximum of ${NOTE_LIMIT_PER_TRACK} notes.`
const FORBIDDEN_MESSAGE = "You can't change that note."

function TrackPage() {
  const { projectId, trackId } = Route.useParams()
  // A malformed id can't name a track; don't ask the server.
  if (
    !projectIdParamsSchema.safeParse({ projectId }).success ||
    !trackIdParamsSchema.safeParse({ trackId }).success
  ) {
    return <TrackNotFound />
  }
  return <Track key={trackId} projectId={projectId} trackId={trackId} />
}

function Track({ projectId, trackId }: { projectId: string; trackId: string }) {
  const qc = useQueryClient()
  const track = useQuery(trackQueryOptions(trackId))
  const notes = useQuery(notesQueryOptions(trackId))
  const project = useQuery(projectQueryOptions(projectId))
  const versions = useQuery(trackListQueryOptions(projectId))
  const [gone, setGone] = useState(false)

  const notFound =
    gone ||
    httpStatus(track.error) === 404 ||
    httpStatus(notes.error) === 404 ||
    (track.data !== undefined && track.data.projectId !== projectId)
  // Otherwise the cached projects list may still link back here.
  useEffect(() => {
    if (notFound) {
      void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true })
    }
  }, [notFound, qc])

  if (notFound) return <TrackNotFound />
  // A failed background refetch keeps showing the data it had.
  if ((track.isError && !track.data) || (notes.isError && !notes.data)) {
    return (
      <TrackError
        projectId={projectId}
        onRetry={() => {
          void track.refetch()
          void notes.refetch()
        }}
      />
    )
  }
  if (!track.data || !notes.data) return <TrackSkeleton />

  return (
    <TrackView
      track={track.data}
      notes={notes.data}
      project={project.data}
      versions={versions.data}
      onGone={() => setGone(true)}
    />
  )
}

function TrackView({
  track,
  notes,
  project,
  versions,
  onGone,
}: {
  track: TrackDetail
  notes: Note[]
  project: Project | undefined
  // Missing while loading or when the list failed: the chips just don't show.
  versions: TrackSummary[] | undefined
  onGone: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const meId = useMe().data?.id
  const desktop = useMediaQuery("(min-width: 1024px)")
  const addBarRef = useRef<HTMLDivElement>(null)
  // The phone "Add note" bar is fixed to the viewport: pad the page so the last note and the
  // footer scroll clear of it, and raise toasts (Undo) above it.
  useEffect(() => {
    const bar = addBarRef.current
    if (desktop || !bar) return
    const root = document.documentElement
    const fit = () => {
      const height = bar.offsetHeight
      document.body.style.paddingBottom = `${height}px`
      root.style.setProperty("--toast-offset-bottom", `${height + 8}px`)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(bar)
    fit()
    return () => {
      observer.disconnect()
      document.body.style.removeProperty("padding-bottom")
      root.style.removeProperty("--toast-offset-bottom")
    }
  }, [desktop])
  const player = usePlayer(track.id, track.durationMs)
  useSpaceToggle(player.toggle)

  const createNote = useCreateNote(track.id)
  const updateNote = useUpdateNote(track.id)
  const deleteNote = useDeleteNote()
  const cache = useNoteCache(track.id)
  const [editing, setEditing] = useState<Note | null>(null)
  // Phones only: the bottom sheet for a new note, opened at the playhead.
  const [adding, setAdding] = useState<{ timeMs: number } | null>(null)
  const draftRef = useRef<{ key: string; draft: NoteDraft } | null>(null)
  const draftKey = editing ? `edit-${editing.id}` : "add"
  const draftProps = {
    draft:
      draftRef.current?.key === draftKey ? draftRef.current.draft : undefined,
    onDraftChange: (draft: NoteDraft | null) => {
      if (draft) draftRef.current = { key: draftKey, draft }
      else if (draftRef.current?.key === draftKey) draftRef.current = null
    },
  }

  // Until the project loads, the role is unknown: offer only what any member may do.
  const isOwner = project?.role === "owner"
  const controlsFor = (note: Note): NoteControls => {
    const own = meId !== undefined && note.author.id === meId
    return { edit: own, delete: own || isOwner, done: own || isOwner }
  }
  // A solo project looks as it did before sharing; a removed member's notes still need names.
  const showAuthors =
    (project?.collaboratorCount ?? 0) > 0 ||
    new Set(notes.map((n) => n.author.id)).size > 1

  const atLimit = notes.length >= NOTE_LIMIT_PER_TRACK
  const doneCount = notes.filter((n) => n.done).length
  // The last note the playhead has passed, while playing.
  const activeId = player.playing
    ? notes.filter((n) => n.timestampMs <= player.currentMs).at(-1)?.id
    : undefined

  const noteGone = (noteId: string) => {
    cache.remove(noteId)
    void cache.refetch()
    toast("That note was already deleted.")
  }

  // The role changed under us (e.g. a stale page): show the server's view of the notes.
  const forbidden = () => {
    void cache.refetch()
    toast.error(FORBIDDEN_MESSAGE)
  }

  const saveError = (err: unknown, noteId?: string): NoteSaveResult => {
    const status = httpStatus(err)
    if (status === 400) {
      return validationPaths(err).some((p) => p.startsWith("/timestampMs"))
        ? "invalid-time"
        : "invalid-text"
    }
    if (status === 403 && apiErrorCode(err) === "note_limit_reached") {
      void cache.refetch()
      setAdding(null)
      return "closed"
    }
    if (status === 403) {
      setEditing(null)
      setAdding(null)
      forbidden()
      return "closed"
    }
    if (status === 404) {
      setEditing(null)
      setAdding(null)
      if (noteId) noteGone(noteId)
      else onGone()
      return "closed"
    }
    return "failed"
  }

  const saveNew = async (body: {
    timestampMs: number
    text: string
  }): Promise<NoteSaveResult> => {
    try {
      await createNote.mutateAsync(body)
      setAdding(null)
      return "saved"
    } catch (err) {
      return saveError(err)
    }
  }

  const saveEdit = async (
    note: Note,
    body: { timestampMs: number; text: string },
  ): Promise<NoteSaveResult> => {
    const changes: UpdateNoteBody = {
      ...(body.text !== note.text ? { text: body.text } : {}),
      ...(body.timestampMs !== note.timestampMs
        ? { timestampMs: body.timestampMs }
        : {}),
    }
    try {
      if (Object.keys(changes).length > 0) {
        await updateNote.mutateAsync({ noteId: note.id, ...changes })
      }
      setEditing(null)
      return "saved"
    } catch (err) {
      return saveError(err, note.id)
    }
  }

  const setDone = async (note: Note, done: boolean) => {
    cache.put({ ...note, done })
    try {
      await updateNote.mutateAsync({ noteId: note.id, done })
    } catch (err) {
      if (httpStatus(err) === 404) {
        noteGone(note.id)
        return
      }
      cache.put(note)
      if (httpStatus(err) === 403) forbidden()
      else toast.error("Couldn't update the note. Try again.")
    }
  }

  const restore = async (note: Note) => {
    try {
      await createNote.mutateAsync({
        timestampMs: note.timestampMs,
        text: note.text,
        done: note.done,
      })
    } catch (err) {
      toast.error(
        httpStatus(err) === 403
          ? LIMIT_MESSAGE
          : "Couldn't restore the note. Try again.",
      )
    }
  }

  const remove = async (note: Note) => {
    if (editing?.id === note.id) setEditing(null)
    cache.remove(note.id)
    try {
      await deleteNote.mutateAsync(note.id)
    } catch (err) {
      if (httpStatus(err) !== 404) {
        cache.put(note)
        if (httpStatus(err) === 403) forbidden()
        else toast.error("Couldn't delete the note. Try again.")
        return
      }
    }
    // Undo re-creates the note as the caller, so it's offered only for one's own.
    if (note.author.id !== meId) {
      toast("Note deleted")
      return
    }
    toast("Note deleted", {
      duration: 5000,
      action: { label: "Undo", onClick: () => void restore(note) },
    })
  }

  const leave = async () => {
    await navigate({
      to: "/app/projects/$projectId",
      params: { projectId: track.projectId },
    })
    forgetTrack(qc, track.id)
  }

  const form = editing ? (
    <NoteForm
      key={`edit-${editing.id}`}
      durationMs={track.durationMs}
      playheadMs={player.currentMs}
      initialTimeMs={editing.timestampMs}
      initialText={editing.text}
      autoFocus
      {...draftProps}
      onSave={(body) => saveEdit(editing, body)}
      onCancel={() => setEditing(null)}
    />
  ) : adding || desktop ? (
    <NoteForm
      key={adding ? `add-${adding.timeMs}` : "add"}
      durationMs={track.durationMs}
      playheadMs={player.currentMs}
      {...(adding ? { initialTimeMs: adding.timeMs } : {})}
      autoFocus={Boolean(adding)}
      alwaysShowCancel={Boolean(adding)}
      disabled={atLimit}
      {...draftProps}
      onSave={saveNew}
      onCancel={() => setAdding(null)}
    />
  ) : null

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            to="/app/projects/$projectId"
            params={{ projectId: track.projectId }}
            className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full pr-2 text-sm font-semibold text-primary-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" />
            <span className="break-words">{project?.name ?? "Project"}</span>
          </Link>
          <h1 className="text-heading-2 break-words">
            <span className="mr-2 font-mono text-muted-foreground tabular-nums">
              v{track.version}
            </span>
            {track.name}
          </h1>
        </div>
        {project && <ShareButton project={project} onGone={onGone} />}
        {isOwner && (
          <TrackMenu
            track={track}
            noteCount={notes.length}
            onGone={onGone}
            onDeleted={() => void leave()}
          />
        )}
      </header>

      {versions && versions.length > 1 && (
        <VersionChips versions={versions} currentId={track.id} />
      )}
      <div className="sticky top-[calc(3.75rem+env(safe-area-inset-top))] z-30 -mx-4 bg-background px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <PlayerPanel player={player} peaks={track.peaks} notes={notes} />
      </div>
      {player.failed && <AudioFailedAlert onRetry={player.retry} />}

      <section
        aria-labelledby="notes-heading"
        className="flex flex-col gap-3 pt-2 lg:pt-0"
      >
        <h2
          id="notes-heading"
          className="text-label tracking-wide text-muted-foreground uppercase"
        >
          {notes.length === 0
            ? "Notes"
            : `${plural(notes.length, "note")} · ${doneCount} done`}
        </h2>
        {desktop && (
          <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <h3 className="font-semibold">
              {editing ? "Edit note" : "Add a note"}
            </h3>
            {atLimit && !editing && <LimitNotice />}
            {form}
          </div>
        )}
        {notes.length === 0 ? (
          <Empty className="border p-6">
            <EmptyMedia>
              <UploadIllustration />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No notes yet</EmptyTitle>
              <EmptyDescription>
                Press play and add one when something catches your ear.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                author={showAuthors ? personName(note.author, meId) : undefined}
                controls={controlsFor(note)}
                active={note.id === activeId}
                editing={note.id === editing?.id}
                onSeek={() => player.seek(note.timestampMs)}
                onDoneChange={(done) => void setDone(note, done)}
                onEdit={() => {
                  // An unsaved edit of another note is dropped, as before; an add draft waits.
                  if (draftRef.current?.key.startsWith("edit-")) {
                    draftRef.current = null
                  }
                  setEditing(note)
                }}
                onDelete={() => void remove(note)}
              />
            ))}
          </ul>
        )}
      </section>

      {!desktop && (
        <>
          <div
            ref={addBarRef}
            className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t bg-background pt-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6"
          >
            {atLimit && <LimitNotice />}
            <Button
              className="w-full"
              disabled={atLimit}
              onClick={() =>
                setAdding({ timeMs: Math.round(player.currentMs) })
              }
            >
              <Plus data-icon="inline-start" />
              Add note
            </Button>
          </div>
          <Drawer
            open={Boolean(adding || editing)}
            onOpenChange={(open) => {
              if (open) return
              draftRef.current = null
              setAdding(null)
              setEditing(null)
            }}
          >
            <DrawerContent
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                if (event.currentTarget instanceof HTMLElement) {
                  event.currentTarget.querySelector("textarea")?.focus()
                }
              }}
            >
              <DrawerHeader>
                <DrawerTitle>
                  {editing ? "Edit note" : "Add a note"}
                </DrawerTitle>
                <DrawerDescription>
                  Nudge the time if it's a little off.
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {form}
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  )
}

function LimitNotice() {
  return <p className="text-sm font-medium text-warning">{LIMIT_MESSAGE}</p>
}

function VersionChips({
  versions,
  currentId,
}: {
  versions: TrackSummary[]
  currentId: string
}) {
  return (
    <nav aria-label="Versions" className="-mx-4 sm:-mx-6 lg:mx-0">
      <ul className="flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] sm:px-6 lg:flex-wrap lg:px-0">
        {versions.map((version) => {
          const current = version.id === currentId
          return (
            <li key={version.id} className="shrink-0">
              <Link
                to="/app/projects/$projectId/tracks/$trackId"
                params={{
                  projectId: version.projectId,
                  trackId: version.id,
                }}
                aria-current={current ? "page" : undefined}
                aria-label={`v${version.version}: ${version.name}`}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border-[1.5px] px-4 font-mono text-time font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  current
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-strong bg-card hover:bg-muted",
                )}
              >
                v{version.version}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function TrackSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading track"
      className="flex flex-col gap-4 lg:gap-6"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-7 w-2/3 rounded-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 rounded-xl md:h-36 lg:h-44" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-2 lg:pt-0">
        <Skeleton className="h-4 w-24 rounded-full" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function TrackError({
  projectId,
  onRetry,
}: {
  projectId: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Track</h1>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Couldn't load this track</AlertTitle>
        <AlertDescription>
          Check your connection and try again.
        </AlertDescription>
      </Alert>
      <Button
        variant="ghost"
        className="w-full sm:w-auto sm:self-start"
        onClick={onRetry}
      >
        Try again
      </Button>
      <Button asChild variant="link" className="w-full sm:w-auto sm:self-start">
        <Link to="/app/projects/$projectId" params={{ projectId }}>
          Back to the project
        </Link>
      </Button>
    </div>
  )
}

function TrackNotFound() {
  return (
    <Empty className="p-6 sm:p-12">
      <EmptyHeader>
        <EmptyTitle>
          <h1 className="text-heading-2">This track doesn't exist</h1>
        </EmptyTitle>
        <EmptyDescription>
          It may have been deleted, you may no longer have access, or the link
          is wrong.
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild className="w-full sm:w-auto">
        <Link to="/app/projects">Go to projects</Link>
      </Button>
    </Empty>
  )
}
