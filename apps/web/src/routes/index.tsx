import {
  type AuthProvider,
  authProviderSchema,
  PLANS,
  returnPathSchema,
} from "@repo/shared/schemas"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { CircleAlert, Info, Layers, Lock, MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { PageLayout } from "@/components/layout/page-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { authProviderLabels, meQueryOptions, useMe } from "@/features/auth/api"
import { SignInButton } from "@/features/auth/sign-in-button"
import { WaveformIllustration } from "@/features/landing/waveform-illustration"
import { formatBytes, plural } from "@/lib/format"
import { site } from "@/lib/site"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({
  // The API's OAuth callback sends failures back here: `?error=oauth`, or
  // `?error=email_in_use&provider=<the provider that email signed up with>`.
  // `next` is the protected page to return to after signing in (an invalid one is dropped).
  validateSearch: z.object({
    error: z.string().optional(),
    provider: authProviderSchema.optional().catch(undefined),
    next: returnPathSchema.optional().catch(undefined),
  }),
  beforeLoad: async ({ context, search: { next } }) => {
    if (!next) return
    // A failed `me` (API down) just renders the landing page.
    const me = await context.queryClient
      .ensureQueryData(meQueryOptions)
      .catch(() => null)
    if (me) throw redirect({ href: next, replace: true })
  },
  component: Landing,
})

const FEATURES = [
  {
    icon: Layers,
    title: "Every bounce is a version",
    description:
      "Upload each new mix of a track and switch between versions in a tap.",
    tint: "bg-tint-lavender",
  },
  {
    icon: MapPin,
    title: "Pin notes to the exact moment",
    description:
      "Tap the waveform, write what you hear, and come back to it at that second.",
    tint: "bg-tint-mint",
  },
  {
    icon: Lock,
    title: "Private until you invite someone",
    description:
      "Only the people you invite can hear your mixes and read your notes. No public links, no feeds, no ads.",
    tint: "bg-tint-butter",
  },
] as const

function signInErrorMessage(error: string, provider?: AuthProvider) {
  if (error !== "email_in_use") return "Sign-in didn't work. Please try again."
  return provider
    ? `That email already has an account. Sign in with ${authProviderLabels[provider]} instead.`
    : "That email already has an account. Sign in the way you did before."
}

function Landing() {
  const me = useMe()
  const { error, provider, next } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [errorMessage, setErrorMessage] = useState(
    error ? signInErrorMessage(error, provider) : null,
  )

  // Drop `?error` once read, so a reload or coming back from the provider doesn't show a stale banner.
  useEffect(() => {
    if (error) navigate({ search: next ? { next } : {}, replace: true })
  }, [error, next, navigate])

  return (
    <PageLayout className="max-w-280 gap-12 lg:gap-20 lg:pt-16">
      <section className="flex flex-col gap-10 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="flex flex-col gap-4 text-center sm:items-center lg:items-start lg:text-left">
          <h1 className="text-display text-balance lg:text-display-desktop">
            {site.tagline}
          </h1>
          <p className="text-pretty text-muted-foreground sm:max-w-xl sm:text-lg">
            {site.description}
          </p>

          {errorMessage && (
            <Alert variant="destructive" className="text-left sm:max-w-xl">
              <CircleAlert />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          {/* Shown while `me` loads too, so it doesn't pop in above the button. */}
          {next && !errorMessage && !me.data && (
            <Alert
              role="status"
              className="text-left sm:max-w-xl *:[svg]:text-muted-foreground"
            >
              <Info />
              <AlertDescription>Sign in to continue.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:items-center lg:items-start">
            {/* Reserve the button's height while `me` loads, so the page doesn't jump. */}
            <div className="flex min-h-14 flex-col sm:flex-row">
              {me.data ? (
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/app">Open {site.name}</Link>
                </Button>
              ) : (
                !me.isLoading && (
                  <SignInButton
                    size="lg"
                    className="w-full sm:w-auto"
                    next={next}
                    onStart={() => setErrorMessage(null)}
                  >
                    Continue with Google
                  </SignInButton>
                )
              )}
            </div>
            <p className="text-caption text-muted-foreground">
              Free: {plural(PLANS.free.projectLimit, "project")},{" "}
              {formatBytes(PLANS.free.storageLimitBytes)} of mixes
            </p>
          </div>
        </div>

        <WaveformIllustration />
      </section>

      <section aria-label="Features">
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description, tint }) => (
            <li
              key={title}
              className={cn(
                "flex flex-col gap-3 rounded-2xl p-6 md:last:col-span-2 lg:last:col-span-1",
                tint,
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-card">
                <Icon aria-hidden className="size-5" />
              </span>
              <h2 className="text-heading-3">{title}</h2>
              <p className="text-pretty text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </section>
    </PageLayout>
  )
}
