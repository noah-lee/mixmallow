import { projectListResponseSchema } from "@repo/shared/schemas"
import { queryOptions } from "@tanstack/react-query"
import { fetchJson } from "@/lib/api"

// Project-scoped queries (track lists, details) nest under this key, so invalidating it
// refreshes them too.
export const PROJECTS_QUERY_KEY = ["projects"] as const

export const projectsQueryOptions = queryOptions({
  queryKey: PROJECTS_QUERY_KEY,
  queryFn: () => fetchJson("/projects", projectListResponseSchema),
  staleTime: 30 * 1000,
})
