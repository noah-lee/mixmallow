import {
  createFileRoute,
  Outlet,
  redirect,
  useMatchRoute,
} from "@tanstack/react-router"
import { PageLayout } from "@/components/layout/page-layout"
import { meQueryOptions } from "@/features/auth/api"

export const Route = createFileRoute("/_app")({
  // Auth guard for every route nested under this layout. Resolves the shared
  // `me` query (cached, so it's usually instant) and bounces unauthenticated
  // visitors to the public landing page.
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions)
    if (!me) throw redirect({ to: "/" })
    return { me }
  },
  component: AppLayout,
})

function AppLayout() {
  const matchRoute = useMatchRoute()
  // The track page goes two-column on desktop, so it needs the full content width.
  const wide = matchRoute({ to: "/app/projects/$projectId/tracks/$trackId" })
  return (
    <PageLayout {...(wide ? { className: "lg:max-w-280" } : {})}>
      <Outlet />
    </PageLayout>
  )
}
