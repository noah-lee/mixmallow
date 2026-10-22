import {
  type AuthProvider,
  type MeResponse,
  meResponseSchema,
  type ReturnPath,
  returnPathSchema,
} from "@repo/shared/schemas"
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import axios from "axios"
import { api, fetchJson } from "@/lib/api"

export const ME_QUERY_KEY = ["auth", "me"] as const

// Shared so the router's auth guard (beforeLoad) and the useMe() hook read the
// same cache entry. Returns null on 401 rather than throwing, so an
// unauthenticated user is a normal state, not an error.
export const meQueryOptions = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await fetchJson("/auth/me", meResponseSchema)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) return null
      throw err
    }
  },
  retry: false,
  staleTime: 5 * 60 * 1000,
})

export function useMe() {
  return useQuery(meQueryOptions)
}

export const authProviderLabels: Record<AuthProvider, string> = {
  google: "Google",
}

export function signIn(provider: AuthProvider, next?: ReturnPath) {
  const query = next ? `?${new URLSearchParams({ next })}` : ""
  window.location.href = `/api/auth/${provider}/start${query}`
}

// The page to come back to after signing in. Undefined for `/app`, where a sign-in lands anyway.
export function returnPathFor(location: {
  pathname: string
  searchStr: string
}): ReturnPath | undefined {
  if (location.pathname === "/app" || location.pathname === "/app/") {
    return undefined
  }
  const path = location.pathname + location.searchStr
  return returnPathSchema.safeParse(path).success ? path : undefined
}

// Set `me` to null rather than invalidating it: the route guards read it with
// ensureQueryData, which happily returns a stale cached user, and nothing
// subscribes to it, so an invalidation never refetches. Clearing first drops
// every cached query that belonged to the old user.
function useSignedOut() {
  const qc = useQueryClient()
  return () => {
    qc.clear()
    qc.setQueryData(ME_QUERY_KEY, null)
  }
}

// Signing out always succeeds in the UI: a failed request still drops the cached user,
// though the server session (and its cookies) survives until it expires.
export function useSignOut() {
  const onSettled = useSignedOut()
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled,
  })
}

export function useSignOutEverywhere() {
  const onSuccess = useSignedOut()
  return useMutation({
    mutationFn: () => api.post("/auth/logout-all"),
    onSuccess,
  })
}
