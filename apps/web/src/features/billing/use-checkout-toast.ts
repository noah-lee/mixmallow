import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useSyncBilling } from "@/features/billing/api"

/**
 * Stripe redirects back to `/account?checkout=success|canceled` (billing/routes.ts). Mounted at
 * the app root so the result is handled wherever the user lands: on success it re-syncs billing
 * state, then clears the query param.
 */
export function useCheckoutToast() {
  const sync = useSyncBilling()
  // StrictMode runs effects twice in dev; one toast per redirect.
  const handled = useRef(false)

  // sync.mutate is stable; this runs once per page load.
  useEffect(() => {
    if (handled.current) return
    const url = new URL(window.location.href)
    const result = url.searchParams.get("checkout")
    if (!result) return
    handled.current = true

    if (result === "success") {
      toast.success("You're subscribed. Thanks!")
      sync.mutate()
    } else if (result === "canceled") {
      toast("Checkout canceled.")
    }
    url.searchParams.delete("checkout")
    window.history.replaceState(null, "", url.toString())
  }, [])
}
