import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
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
  return (
    <PageLayout>
      <Outlet />
    </PageLayout>
  )
}
