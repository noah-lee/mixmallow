import type { MeResponse } from "@repo/shared/schemas"
import axios from "axios"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  usePortal,
  useStartSubscription,
  useSubscription,
} from "@/features/billing/api"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// Both actions send the browser to a Stripe-hosted page, so the button stays busy on success.
const redirectTo = {
  onSuccess: ({ url }: { url: string }) => {
    window.location.href = url
  },
  onError: (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      toast("You already have a subscription.")
      return
    }
    toast.error("Couldn't reach billing. Try again.")
  },
}

export function BillingSection({ user }: { user: MeResponse }) {
  const subscription = useSubscription()
  const startSubscription = useStartSubscription()
  const portal = usePortal()
  const sub = subscription.data
  const busy = startSubscription.isPending || portal.isPending
  // A past_due/unpaid/paused subscription isn't premium but still exists: manage it, don't start another.
  const hasSubscription =
    user.isPremium ||
    (sub != null &&
      sub.status !== "canceled" &&
      sub.status !== "incomplete_expired")

  return (
    <section aria-labelledby="billing" className="flex flex-col gap-3 py-6">
      <h2 id="billing" className="text-sm font-medium text-muted-foreground">
        Plan
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-medium">
            {user.isPremium ? "Premium" : "Free"}
            {sub?.cancelAtPeriodEnd && (
              <Badge variant="outline">Canceling</Badge>
            )}
          </p>
          {user.isPremium &&
            (subscription.isPending ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              sub && (
                <p className="text-sm text-muted-foreground">
                  {sub.cancelAtPeriodEnd ? "Ends" : "Renews"} on{" "}
                  {formatDate(sub.currentPeriodEnd)}
                </p>
              )
            ))}
        </div>
        {hasSubscription ? (
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => portal.mutate(undefined, redirectTo)}
          >
            {portal.isPending && <Spinner data-icon="inline-start" />}
            Manage billing
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => startSubscription.mutate(undefined, redirectTo)}
          >
            {startSubscription.isPending && (
              <Spinner data-icon="inline-start" />
            )}
            Upgrade to Premium
          </Button>
        )}
      </div>
    </section>
  )
}
