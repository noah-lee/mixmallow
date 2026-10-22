import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ME_QUERY_KEY, returnPathFor } from "@/features/auth/api"
import { setSessionExpiredHandler } from "@/lib/api"
import { ThemeProvider } from "@/providers/theme-provider"
import { routeTree } from "./routeTree.gen"

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
})

// Register the router instance for type-safe navigation (Link, useNavigate…).
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Only for a signed-in user on (or opening) a protected page: a signed-out landing gets 401s too,
// and sign-out clears the cached user before anything else can fail. Several requests failing
// together redirect once.
let expiring = false
setSessionExpiredHandler(() => {
  if (expiring || !queryClient.getQueryData(ME_QUERY_KEY)) return
  // The latest location, so a navigation still loading counts as the page being opened.
  const location = router.latestLocation
  const matches = router.matchRoutes(location)
  if (!matches.some((match) => match.routeId === "/_app")) return
  expiring = true
  const next = returnPathFor(location)
  queryClient.clear()
  queryClient.setQueryData(ME_QUERY_KEY, null)
  void router
    .navigate({ to: "/", search: next ? { next } : {}, replace: true })
    .finally(() => {
      expiring = false
    })
})

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("Root element #root not found")

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
