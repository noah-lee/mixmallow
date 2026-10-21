import { usageResponseSchema } from "@repo/shared/schemas"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchJson } from "@/lib/api"

export const USAGE_QUERY_KEY = ["usage"] as const

export const usageQueryOptions = queryOptions({
  queryKey: USAGE_QUERY_KEY,
  queryFn: () => fetchJson("/usage", usageResponseSchema),
})

export function useUsage() {
  return useQuery(usageQueryOptions)
}
