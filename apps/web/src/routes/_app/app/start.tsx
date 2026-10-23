import { PLANS } from "@repo/shared/schemas"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMe } from "@/features/auth/api"
import { projectsQueryOptions } from "@/features/projects/api"
import { UploadPanel } from "@/features/uploads/upload-panel"
import { useUpload } from "@/features/uploads/use-upload"
import { useUsage } from "@/features/usage/api"
import { formatBytes } from "@/lib/format"

export const Route = createFileRoute("/_app/app/start")({
  beforeLoad: async ({ context }) => {
    // A failed check still shows the page: the server refuses a second project anyway,
    // and that answer sends the user to /app.
    const projects = await context.queryClient
      .fetchQuery(projectsQueryOptions)
      .catch(() => null)
    if (projects?.items.length) throw redirect({ to: "/app", replace: true })
  },
  component: FirstUpload,
})

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || "there"
}

function FirstUpload() {
  const { me: snapshot } = Route.useRouteContext()
  const me = useMe().data ?? snapshot
  // Limits fall back to the free plan while usage loads or if it fails.
  const usage = useUsage().data
  const maxFileBytes = usage?.maxFileBytes ?? PLANS.free.maxFileBytes
  const storageLimitBytes =
    usage?.storageLimitBytes ?? PLANS.free.storageLimitBytes
  const projectLimit = usage?.projectLimit ?? PLANS.free.projectLimit
  const upload = useUpload({ maxFileBytes })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-1 text-balance">
          Hi {firstName(me.name)}, let's add your first mix
        </h1>
        <p className="text-pretty text-muted-foreground">
          It becomes version 1 of a new project. Upload each new bounce there
          and keep your notes per version.
        </p>
      </div>
      <UploadPanel upload={upload} maxFileBytes={maxFileBytes} />
      <p className="text-center text-caption text-muted-foreground">
        Free: {projectLimit} {projectLimit === 1 ? "project" : "projects"},{" "}
        {formatBytes(storageLimitBytes)} of mixes
      </p>
    </div>
  )
}
