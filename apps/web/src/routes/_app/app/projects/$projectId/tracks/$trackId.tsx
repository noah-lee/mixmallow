import { createFileRoute } from "@tanstack/react-router"

// Stand-in until the track screen lands; uploads and /app already link here.
export const Route = createFileRoute(
  "/_app/app/projects/$projectId/tracks/$trackId",
)({
  component: TrackPage,
})

function TrackPage() {
  return <h1 className="text-heading-1">Track</h1>
}
