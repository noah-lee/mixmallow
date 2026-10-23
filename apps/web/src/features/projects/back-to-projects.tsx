import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

// Its negative margins assume a parent `flex-col gap-6`.
export function BackToProjects() {
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
