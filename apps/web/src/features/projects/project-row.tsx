import type { Project } from "@repo/shared/schemas"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { personName } from "@/features/members/person-name"
import { formatShortDate, plural } from "@/lib/format"

export function ProjectRow({
  project,
  variant = "owned",
}: {
  project: Project
  variant?: "owned" | "shared"
}) {
  return (
    <li className="rounded-xl border bg-card">
      <Link
        to="/app/projects/$projectId"
        params={{ projectId: project.id }}
        className="flex min-h-11 items-center gap-3 rounded-xl p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold break-words">{project.name}</span>
          {variant === "shared" ? (
            <SharedDetails project={project} />
          ) : (
            <span className="text-sm text-muted-foreground">
              {plural(project.trackCount, "version")} · Created{" "}
              {formatShortDate(project.createdAt)}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="size-5 shrink-0 text-muted-foreground"
        />
      </Link>
    </li>
  )
}

function SharedDetails({ project }: { project: Project }) {
  return (
    <>
      <span className="text-sm break-words text-muted-foreground">
        Shared by {personName(project.owner)}
      </span>
      <span className="text-sm text-muted-foreground">
        {plural(project.trackCount, "version")}
        {project.joinedAt && <> · Joined {formatShortDate(project.joinedAt)}</>}
      </span>
    </>
  )
}
