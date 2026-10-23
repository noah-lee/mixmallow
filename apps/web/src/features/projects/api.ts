import {
  projectListResponseSchema,
  projectSchema,
  type RenameBody,
  type TrackListResponse,
  type TrackSummary,
  trackListResponseSchema,
  trackSummarySchema,
} from "@repo/shared/schemas"
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { USAGE_QUERY_KEY } from "@/features/usage/api"
import { api, fetchJson, retryUnlessClientError } from "@/lib/api"

// Project-scoped queries (track lists, details) nest under this key, so invalidating it
// refreshes them too.
export const PROJECTS_QUERY_KEY = ["projects"] as const

export const projectsQueryOptions = queryOptions({
  queryKey: PROJECTS_QUERY_KEY,
  queryFn: () => fetchJson("/projects", projectListResponseSchema),
  staleTime: 30 * 1000,
})

export const projectKey = (projectId: string) =>
  [...PROJECTS_QUERY_KEY, projectId] as const
const tracksKey = (projectId: string) =>
  [...projectKey(projectId), "tracks"] as const

export const projectQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: projectKey(projectId),
    queryFn: () => fetchJson(`/projects/${projectId}`, projectSchema),
    retry: retryUnlessClientError,
  })

// Every page, so the list and the delete dialog's totals are complete.
export const trackListQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: tracksKey(projectId),
    queryFn: async ({ signal }) => {
      const items: TrackSummary[] = []
      let cursor: string | null = null
      do {
        const page: TrackListResponse = await fetchJson(
          `/projects/${projectId}/tracks`,
          trackListResponseSchema,
          { params: { limit: 100, ...(cursor ? { cursor } : {}) }, signal },
        )
        items.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)
      return items
    },
    retry: retryUnlessClientError,
  })

export function useRenameProject(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: RenameBody) => {
      const { data } = await api.patch(`/projects/${projectId}`, body)
      return projectSchema.parse(data)
    },
    onSuccess: (project) => {
      qc.setQueryData(projectKey(projectId), project)
      void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true })
    },
  })
}

export function useDeleteProject(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}`),
    // Not the project's own queries: they're still mounted and would refetch into a 404
    // before the page navigates away.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true }),
        qc.invalidateQueries({ queryKey: USAGE_QUERY_KEY }),
      ]),
  })
}

export function forgetProject(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  qc.removeQueries({ queryKey: projectKey(projectId) })
}

export function useRenameTrack(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      trackId,
      ...body
    }: RenameBody & { trackId: string }) => {
      const { data } = await api.patch(`/tracks/${trackId}`, body)
      return trackSummarySchema.parse(data)
    },
    onSuccess: (track) => {
      qc.setQueryData<TrackSummary[]>(tracksKey(projectId), (items) =>
        items?.map((item) => (item.id === track.id ? track : item)),
      )
    },
  })
}

export function useDeleteTrack(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (trackId: string) => api.delete(`/tracks/${trackId}`),
    onSuccess: (_, trackId) => removeTrack(qc, projectId, trackId),
  })
}

// After a delete, or when the server says the version is already gone.
export function removeTrack(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  trackId: string,
) {
  qc.setQueryData<TrackSummary[]>(tracksKey(projectId), (items) =>
    items?.filter((item) => item.id !== trackId),
  )
  // The project key covers the track list, so this also refetches it.
  return Promise.all([
    qc.invalidateQueries({ queryKey: projectKey(projectId) }),
    qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true }),
    qc.invalidateQueries({ queryKey: USAGE_QUERY_KEY }),
  ])
}
