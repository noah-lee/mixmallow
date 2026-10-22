import {
  createFileRoute,
  Outlet,
  redirect,
  useMatchRoute,
} from "@tanstack/react-router"
import { PageLayout } from "@/components/layout/page-layout"
import { meQueryOptions, returnPathFor } from "@/features/auth/api"

export const Route = createFileRoute("/_app")({
  // Auth guard for every route nested under this layout. Resolves the shared
  // `me` query (cached, so it's usually instant) and bounces unauthenticated
  // visitors to the public landing page, which signs them in and sends them back.
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!me) {
      const next = returnPathFor(location)
      throw redirect({ to: "/", search: next ? { next } : {}, replace: true })
    }
    return { me }
  },
  component: AppLayout,
})

function AppLayout() {
  const matchRoute = useMatchRoute()
  // The track page's waveform gets the full content width on desktop.
  const wide = matchRoute({ to: "/app/projects/$projectId/tracks/$trackId" })
  return (
    <PageLayout {...(wide ? { className: "lg:max-w-280" } : {})}>
      <Outlet />
    </PageLayout>
  )
}
