import { MAX_FILE_BYTES, MB, projectIdParamsSchema } from "@repo/shared/schemas"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, CircleAlert, Ellipsis, Pencil, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { ShareButton } from "@/features/members/share-sheet"
import {
  forgetProject,
  PROJECTS_QUERY_KEY,
  projectQueryOptions,
  trackListQueryOptions,
  useDeleteProject,
  useRenameProject,
} from "@/features/projects/api"
import { ConfirmDeleteDialog } from "@/features/projects/confirm-delete-dialog"
import {
  RenameDialog,
  type RenameResult,
} from "@/features/projects/rename-dialog"
import { VersionRow } from "@/features/projects/version-row"
import { Dropzone, UploadPanel } from "@/features/uploads/upload-panel"
import { useUpload } from "@/features/uploads/use-upload"
import { useUsage } from "@/features/usage/api"
import { UsageMeter } from "@/features/usage/usage-meter"
import { httpStatus } from "@/lib/api"
import { formatBytes, plural } from "@/lib/format"

export const Route = createFileRoute("/_app/app/projects/$projectId/")({
  component: ProjectPage,
})

function ProjectPage() {
  const { projectId } = Route.useParams()
  // A malformed id can't name a project; don't ask the server.
  if (!projectIdParamsSchema.safeParse({ projectId }).success) {
    return <ProjectNotFound />
  }
  return <Project key={projectId} projectId={projectId} />
}

function Project({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const project = useQuery(projectQueryOptions(projectId))
  const tracks = useQuery(trackListQueryOptions(projectId))
  const usage = useUsage().data
  const [gone, setGone] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const versionsRef = useRef<HTMLHeadingElement>(null)
  // A deleted row takes its menu button with it.
  const focusAfterDelete = useCallback(
    () => (versionsRef.current ?? titleRef.current)?.focus(),
    [],
  )

  const maxFileBytes = usage?.maxFileBytes ?? MAX_FILE_BYTES
  const spaceLeftBytes = usage
    ? Math.max(0, usage.storageLimitBytes - usage.storageUsedBytes)
    : undefined
  const storageFull = spaceLeftBytes !== undefined && spaceLeftBytes < MB
  const onProjectNotFound = useCallback(() => setGone(true), [])
  const upload = useUpload({
    projectId,
    maxFileBytes,
    ...(spaceLeftBytes !== undefined ? { spaceLeftBytes } : {}),
    onProjectNotFound,
  })

  const deleteProject = useDeleteProject(projectId)
  const leave = async () => {
    await navigate({ to: "/app/start" })
    forgetProject(qc, projectId)
  }

  const notFound =
    gone ||
    httpStatus(project.error) === 404 ||
    httpStatus(tracks.error) === 404
  // Otherwise /app may still route "Go to my project" back here from the cached list.
  useEffect(() => {
    if (notFound) {
      void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true })
    }
  }, [notFound, qc])

  if (notFound) return <ProjectNotFound />
  // A failed background refetch keeps showing the data it had.
  if ((project.isError && !project.data) || (tracks.isError && !tracks.data)) {
    return (
      <ProjectError
        onRetry={() => {
          void project.refetch()
          void tracks.refetch()
        }}
      />
    )
  }
  if (!project.data || !tracks.data) return <ProjectSkeleton />

  const versions = tracks.data
  const idle = upload.state.status === "idle"
  const uploadError = upload.state.status === "idle" ? upload.state.error : null
  const dropzone = (empty: boolean) => (
    <Dropzone
      compact={!empty}
      title={empty ? "No versions yet" : "Drag a new mix here"}
      description="Upload a mix to keep working on this song."
      buttonLabel={empty ? "Upload a version" : "Upload a new version"}
      error={uploadError}
      maxFileBytes={maxFileBytes}
      disabled={storageFull || !idle}
      notice={
        storageFull && usage ? (
          <p className="font-medium text-warning">
            Free plan: {formatBytes(usage.storageLimitBytes)} used. Delete a
            version to upload another.
          </p>
        ) : undefined
      }
      onFile={(file) => void upload.choose(file)}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      <BackToProjects />
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="text-heading-1 break-words outline-none"
          >
            {project.data.name}
          </h1>
          {usage ? (
            <UsageMeter
              usedBytes={usage.storageUsedBytes}
              limitBytes={usage.storageLimitBytes}
            />
          ) : (
            <Skeleton className="h-9 w-full rounded-full sm:w-52" />
          )}
        </div>
        <ShareButton project={project.data} onGone={onProjectNotFound} />
        <ProjectMenu
          name={project.data.name}
          trackCount={project.data.trackCount}
          noteCount={versions.reduce((sum, t) => sum + t.noteCount, 0)}
          projectId={projectId}
          deleting={deleteProject.isPending}
          onDelete={() =>
            deleteProject.mutate(undefined, {
              onSuccess: () => void leave(),
              onError: (err) => {
                if (httpStatus(err) === 404) {
                  void leave()
                  return
                }
                toast.error("Couldn't delete the project. Try again.")
              },
            })
          }
          onGone={() => setGone(true)}
        />
      </div>

      {versions.length === 0 && idle ? (
        dropzone(true)
      ) : (
        <>
          {dropzone(false)}
          <section aria-labelledby="versions" className="flex flex-col gap-3">
            <h2
              ref={versionsRef}
              id="versions"
              tabIndex={-1}
              className="text-label tracking-wide text-muted-foreground uppercase outline-none"
            >
              Versions
            </h2>
            <ul className="flex flex-col gap-3">
              {!idle && (
                <li>
                  <UploadPanel
                    upload={upload}
                    maxFileBytes={maxFileBytes}
                    variant="row"
                  />
                </li>
              )}
              {versions.map((track) => (
                <VersionRow
                  key={track.id}
                  track={track}
                  onDeleted={focusAfterDelete}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

function deleteTitle(name: string, trackCount: number, noteCount: number) {
  const parts = [
    trackCount > 0 ? plural(trackCount, "version") : null,
    noteCount > 0 ? plural(noteCount, "note") : null,
  ].filter(Boolean)
  if (parts.length === 0) return `Delete ${name}?`
  if (parts.length === 1) return `Delete ${name} and its ${parts[0]}?`
  return `Delete ${name}, its ${parts.join(" and ")}?`
}

function ProjectMenu({
  projectId,
  name,
  trackCount,
  noteCount,
  deleting,
  onDelete,
  onGone,
}: {
  projectId: string
  name: string
  trackCount: number
  noteCount: number
  deleting: boolean
  // A failure leaves the dialog open (with a toast).
  onDelete: () => void
  onGone: () => void
}) {
  const rename = useRenameProject(projectId)
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)

  const save = async (next: string): Promise<RenameResult> => {
    try {
      await rename.mutateAsync({ name: next })
      return "saved"
    } catch (err) {
      const status = httpStatus(err)
      if (status === 404) {
        onGone()
        return "gone"
      }
      return status === 400 ? "invalid" : "failed"
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={menuRef}
            variant="icon"
            size="icon"
            aria-label="Project options"
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
            Rename project
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            variant="destructive"
            onSelect={() => setConfirming(true)}
          >
            <Trash2 />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename project"
        description="Usually the song's name."
        currentName={name}
        onSave={save}
      />
      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={deleteTitle(name, trackCount, noteCount)}
        pending={deleting}
        onConfirm={onDelete}
        returnFocus={() => menuRef.current?.focus()}
      />
    </>
  )
}

function BackToProjects() {
  return (
    <Link
      to="/app/projects"
      aria-label="Back to projects"
      className="-mt-2 -mb-3 -ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Projects
    </Link>
  )
}

// The back link stays real while loading, so it works before the data arrives.
function ProjectSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <BackToProjects />
      <div
        role="status"
        aria-label="Loading project"
        className="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-2/3 rounded-full" />
          <Skeleton className="h-9 w-full rounded-full sm:w-52" />
        </div>
        <Skeleton className="h-28 rounded-4xl sm:h-20" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-25 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Project</h1>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Couldn't load this project</AlertTitle>
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
    </div>
  )
}

function ProjectNotFound() {
  return (
    <Empty className="p-6 sm:p-12">
      <EmptyHeader>
        <EmptyTitle>
          <h1 className="text-heading-2">This project doesn't exist</h1>
        </EmptyTitle>
        <EmptyDescription>
          It may have been deleted, or the link is wrong.
        </EmptyDescription>
      </EmptyHeader>
      <Button asChild className="w-full sm:w-auto">
        <Link to="/app">Go to my project</Link>
      </Button>
    </Empty>
  )
}
