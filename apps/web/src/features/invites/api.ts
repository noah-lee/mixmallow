import {
  inviteMembershipResponseSchema,
  inviteResponseSchema,
  joinResponseSchema,
} from "@repo/shared/schemas"
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { PROJECTS_QUERY_KEY } from "@/features/projects/api"
import { api, fetchJson, retryUnlessClientError } from "@/lib/api"

const inviteKey = (token: string) => ["invites", token] as const

export const inviteQueryOptions = (token: string) =>
  queryOptions({
    queryKey: inviteKey(token),
    queryFn: () => fetchJson(`/invites/${token}`, inviteResponseSchema),
    retry: retryUnlessClientError,
  })

// Signed in only. Non-null for the owner or an existing collaborator.
export const inviteMembershipQueryOptions = (token: string) =>
  queryOptions({
    queryKey: [...inviteKey(token), "membership"] as const,
    queryFn: () =>
      fetchJson(`/invites/${token}/membership`, inviteMembershipResponseSchema),
    retry: retryUnlessClientError,
  })

export function useJoinInvite(token: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/invites/${token}/join`)
      return joinResponseSchema.parse(data)
    },
    // Also drops a cached 404 from visiting the project before joining, and the cached
    // non-membership so reopening the link doesn't flash the Join card.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: inviteKey(token) })
    },
  })
}
