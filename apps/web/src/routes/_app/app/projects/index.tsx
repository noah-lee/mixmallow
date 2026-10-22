import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { projectsQueryOptions } from "@/features/projects/api"
import { ProjectRow } from "@/features/projects/project-row"
import { useUsage } from "@/features/usage/api"
import { retryUnlessClientError } from "@/lib/api"

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-1">Projects</h1>
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {items.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
        {usage && (
          <p className="text-sm text-muted-foreground">
            Free plan: {usage.projectCount} of {usage.projectLimit} projects
          </p>
        )}
      </div>
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
