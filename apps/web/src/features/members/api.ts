import {
  type InviteLinkResponse,
  inviteLinkResponseSchema,
  type MemberListResponse,
  memberListResponseSchema,
} from "@repo/shared/schemas"
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { PROJECTS_QUERY_KEY, projectKey } from "@/features/projects/api"
import { api, fetchJson, retryUnlessClientError } from "@/lib/api"

const membersKey = (projectId: string) =>
  [...projectKey(projectId), "members"] as const
const inviteLinkKey = (projectId: string) =>
  [...projectKey(projectId), "invite"] as const

export const membersQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: membersKey(projectId),
    queryFn: () =>
      fetchJson(`/projects/${projectId}/members`, memberListResponseSchema),
    retry: retryUnlessClientError,
  })

// Owner only: a collaborator gets 403.
export const inviteLinkQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: inviteLinkKey(projectId),
    queryFn: () =>
      fetchJson(`/projects/${projectId}/invite`, inviteLinkResponseSchema),
    retry: retryUnlessClientError,
  })

// Create and reset are the same call: the server always issues a new token.
export function useCreateInviteLink(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/projects/${projectId}/invite`)
      return inviteLinkResponseSchema.parse(data)
    },
    onSuccess: (link) => qc.setQueryData(inviteLinkKey(projectId), link),
  })
}

export function useTurnOffInviteLink(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/invite`),
    onSuccess: () =>
      qc.setQueryData<InviteLinkResponse>(inviteLinkKey(projectId), {
        url: null,
      }),
  })
}

// The owner removing a collaborator.
export function useRemoveMember(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/projects/${projectId}/members/${userId}`),
    onSuccess: (_, userId) => dropMember(qc, projectId, userId),
  })
}

// No cache work here: refetching the project now would 404 and unmount the page before
// the caller navigates away.
export function useLeaveProject(projectId: string) {
  return useMutation({
    mutationFn: (meId: string) =>
      api.delete(`/projects/${projectId}/members/${meId}`),
  })
}

function dropMember(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  userId: string,
) {
  qc.setQueryData<MemberListResponse>(membersKey(projectId), (list) =>
    list ? { items: list.items.filter((m) => m.id !== userId) } : list,
  )
  // collaboratorCount on the project and in the list.
  return Promise.all([
    qc.invalidateQueries({ queryKey: projectKey(projectId), exact: true }),
    qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true }),
  ])
}
