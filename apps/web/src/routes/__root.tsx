import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Link,
  Outlet,
  useRouter,
} from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { useCheckoutToast } from "@/features/billing/use-checkout-toast"

export type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  // Mostly the auth guard's `me` request failing (API down, offline).
  errorComponent: RouteError,
})

function RootLayout() {
  useCheckoutToast()
  return <Outlet />
}

function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-heading text-2xl font-semibold">Page not found</p>
      <p className="text-sm text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Back home</Link>
      </Button>
    </div>
  )
}

function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-heading text-2xl font-semibold">
        Something went wrong
      </p>
      <p className="text-sm text-muted-foreground">
        Couldn't reach the server. Check your connection.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          reset()
          router.invalidate()
        }}
      >
        Try again
      </Button>
    </div>
  )
}
