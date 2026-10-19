import {
  type CheckoutResponse,
  checkoutResponseSchema,
  type SubscriptionResponse,
  subscriptionResponseSchema,
} from "@repo/shared/schemas"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { ME_QUERY_KEY } from "@/features/auth/api"
import { api, fetchJson } from "@/lib/api"

const SUBSCRIPTION_QUERY_KEY = ["billing", "subscription"] as const

function invalidateBilling(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ME_QUERY_KEY })
  qc.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY })
}

// Both endpoints answer with a Stripe-hosted URL to send the browser to.
async function postForRedirect(url: string): Promise<CheckoutResponse> {
  const { data } = await api.post(url, {})
  return checkoutResponseSchema.parse(data)
}

export function useStartSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => postForRedirect("/billing/checkout"),
    // 409 already_subscribed: the server just synced from Stripe, so refresh what's shown.
    onError: (err) => {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        invalidateBilling(qc)
      }
    },
  })
}

export function usePortal() {
  return useMutation({
    mutationFn: () => postForRedirect("/billing/portal"),
  })
}

export function useSyncBilling() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post("/billing/sync"),
    onSettled: () => invalidateBilling(qc),
  })
}

export function useSubscription() {
  return useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: async (): Promise<SubscriptionResponse | null> => {
      try {
        return await fetchJson(
          "/billing/subscription",
          subscriptionResponseSchema,
        )
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null
        throw err
      }
    },
  })
}
