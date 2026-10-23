import { PLANS } from "@repo/shared/schemas"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useMe } from "@/features/auth/api"
import { projectsQueryOptions } from "@/features/projects/api"
import { UploadPanel } from "@/features/uploads/upload-panel"
import { useUpload } from "@/features/uploads/use-upload"
import { usageQueryOptions, useUsage } from "@/features/usage/api"
import { formatBytes, plural } from "@/lib/format"

export const Route = createFileRoute("/_app/app/start")({
  beforeLoad: async ({ context }) => {
    // A failed check still shows the page: the server refuses a project over the limit,
    // and that answer sends the user to /app/projects.
    const [projects, usage] = await Promise.all([
      context.queryClient.fetchQuery(projectsQueryOptions).catch(() => null),
      context.queryClient.fetchQuery(usageQueryOptions).catch(() => null),
    ])
    const limit = usage?.projectLimit ?? PLANS.free.projectLimit
    if (projects && projects.items.length >= limit) {
      throw redirect({ to: "/app/projects", replace: true })
    }
    // Fixed at load so the heading doesn't flip once this upload creates a project.
    // Unknown (the list failed to load) reads as a first upload.
    return { ownsProjects: (projects?.items.length ?? 0) > 0 }
  },
  component: StartPage,
})

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || "there"
}

function StartPage() {
  const { me: snapshot, ownsProjects } = Route.useRouteContext()
  const me = useMe().data ?? snapshot
  // Limits fall back to the free plan while usage loads or if it fails.
  const usage = useUsage().data
  const maxFileBytes = usage?.maxFileBytes ?? PLANS.free.maxFileBytes
  const acceptedFormats = usage?.acceptedFormats ?? PLANS.free.acceptedFormats
  const storageLimitBytes =
    usage?.storageLimitBytes ?? PLANS.free.storageLimitBytes
  const projectLimit = usage?.projectLimit ?? PLANS.free.projectLimit
  const upload = useUpload({ maxFileBytes, acceptedFormats })

  return (
    <div className="flex flex-col gap-6">
      {ownsProjects && (
        <Link
          to="/app/projects"
          aria-label="Back to projects"
          className="-mt-2 -mb-3 -ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Projects
        </Link>
      )}
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 text-balance">
          {ownsProjects
            ? "Start a new project"
            : `Hi ${firstName(me.name)}, let's add your first mix`}
        </h1>
        <p className="text-pretty text-muted-foreground">
          It becomes version 1 of a new project. Upload each new bounce there
          and keep your notes per version.
        </p>
      </div>
      <UploadPanel
        upload={upload}
        maxFileBytes={maxFileBytes}
        acceptedFormats={acceptedFormats}
      />
      <p className="text-center text-caption text-muted-foreground">
        Free: {plural(projectLimit, "project")},{" "}
        {formatBytes(storageLimitBytes)} of mixes
      </p>
    </div>
  )
}
