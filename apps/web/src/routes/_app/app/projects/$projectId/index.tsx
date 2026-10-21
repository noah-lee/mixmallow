import { createFileRoute } from "@tanstack/react-router"

// Stand-in until the project screen lands; uploads and /app already link here.
export const Route = createFileRoute("/_app/app/projects/$projectId/")({
  component: ProjectPage,
})

function ProjectPage() {
  return <h1 className="text-heading-1">Project</h1>
}
