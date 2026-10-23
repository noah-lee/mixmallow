import type { Project } from "@repo/shared/schemas"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { projectsQueryOptions } from "@/features/projects/api"
import { ProjectRow } from "@/features/projects/project-row"
import { useUsage } from "@/features/usage/api"
import { retryUnlessClientError } from "@/lib/api"
import { plural } from "@/lib/format"

export const Route = createFileRoute("/_app/app/projects/")({
  component: ProjectsPage,
})

function ProjectsPage() {
  const projects = useQuery({
    ...projectsQueryOptions,
    retry: retryUnlessClientError,
  })
  const usage = useUsage().data

  // A failed background refetch keeps showing the list it had.
  if (projects.isError && !projects.data) {
    return <ProjectsError onRetry={() => void projects.refetch()} />
  }
  if (!projects.data) return <ProjectsSkeleton />

  const { items, shared } = projects.data
  if (items.length === 0 && shared.length === 0) {
    return <Navigate to="/app/start" replace />
  }

  const plan = usage && (
    <p className="text-sm text-muted-foreground">
      Free plan: {usage.projectCount} of {plural(usage.projectLimit, "project")}
    </p>
  )

  // Without shared projects the page keeps its single, untitled list.
  if (shared.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-heading-1">Projects</h1>
        <div className="flex flex-col gap-3">
          <ProjectList projects={items} />
          {plan}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-1">Projects</h1>
      <section aria-labelledby="own-projects" className="flex flex-col gap-3">
        <h2
          id="own-projects"
          className="text-label tracking-wide text-muted-foreground uppercase"
        >
          Your projects
        </h2>
        {items.length > 0 ? <ProjectList projects={items} /> : <NoOwnProject />}
        {plan}
      </section>
      <section
        aria-labelledby="shared-projects"
        className="flex flex-col gap-3"
      >
        <h2
          id="shared-projects"
          className="text-label tracking-wide text-muted-foreground uppercase"
        >
          Shared with you
        </h2>
        <ProjectList projects={shared} variant="shared" />
      </section>
    </div>
  )
}

function ProjectList({
  projects,
  variant,
}: {
  projects: Project[]
  variant?: "shared"
}) {
  return (
    <ul className="flex flex-col gap-3">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          {...(variant && { variant })}
        />
      ))}
    </ul>
  )
}

function NoOwnProject() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        You don't have a project yet
      </p>
      <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
        <Link to="/app/start">Upload a track</Link>
      </Button>
    </div>
  )
}

function ProjectsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading projects"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-9 w-1/2 rounded-full sm:w-52" />
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function ProjectsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Projects</h1>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Couldn't load your projects</AlertTitle>
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
