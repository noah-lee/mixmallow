import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { projectsQueryOptions } from "@/features/projects/api"

// The signed-in entry: the newest version of the user's project, or onboarding.
export const Route = createFileRoute("/_app/app/")({
  loader: async ({ context }) => {
    const { items } = await context.queryClient.fetchQuery(projectsQueryOptions)
    const project = items[0]
    if (!project) throw redirect({ to: "/app/start", replace: true })
    if (project.latestTrack) {
      throw redirect({
        to: "/app/projects/$projectId/tracks/$trackId",
        params: { projectId: project.id, trackId: project.latestTrack.id },
        replace: true,
      })
    }
    throw redirect({
      to: "/app/projects/$projectId",
      params: { projectId: project.id },
      replace: true,
    })
  },
  pendingComponent: EntryPending,
  errorComponent: EntryError,
})

function EntryPending() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

function EntryError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Your projects</h1>
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
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Try again
      </Button>
    </div>
  )
}
