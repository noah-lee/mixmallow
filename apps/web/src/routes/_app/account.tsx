import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CircleAlert, LogOut } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { UserAvatar } from "@/components/layout/user-avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  authProviderLabels,
  useMe,
  useSignOut,
  useSignOutEverywhere,
} from "@/features/auth/api"
import { useUsage } from "@/features/usage/api"
import { formatBytes, plural } from "@/lib/format"
import { site } from "@/lib/site"
import { useTheme } from "@/providers/theme-provider"

export const Route = createFileRoute("/_app/account")({
  component: Account,
})

function Account() {
  // Live, so a profile change shows up. The guard's snapshot covers sign-out, which nulls
  // `me` before navigating away.
  const { me: snapshot } = Route.useRouteContext()
  const me = useMe().data ?? snapshot

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Account</h1>
      <section aria-label="Profile" className="flex items-center gap-4 pb-6">
        <UserAvatar user={me} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-medium">{me.name ?? me.email}</p>
          {me.name && (
            <p
              title={me.email}
              className="truncate text-sm text-muted-foreground"
            >
              {me.email}
            </p>
          )}
          {/* Static: Google is the only provider and /me doesn't return it. */}
          <p className="text-caption text-muted-foreground">
            Signed in with {authProviderLabels.google}
          </p>
        </div>
      </section>
      <Separator />
      <UsageSection />
      <Separator />
      <AppearanceSection />
      <Separator />
      <SessionSection />
      <Separator className="mt-6" />
      <DeletionSection />
    </div>
  )
}

function UsageSection() {
  const me = useMe()
  const usage = useUsage()

  return (
    <section aria-labelledby="usage" className="flex flex-col gap-3 py-6">
      <h2
        id="usage"
        className="text-label tracking-wide text-muted-foreground uppercase"
      >
        Usage
      </h2>
      {usage.data ? (
        <p>
          {usage.data.projectCount} of{" "}
          {plural(usage.data.projectLimit, "project")} ·{" "}
          {formatBytes(usage.data.storageUsedBytes)} of{" "}
          {formatBytes(usage.data.storageLimitBytes)}
        </p>
      ) : usage.isError ? (
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Couldn't load your usage</AlertTitle>
            <AlertDescription>
              Check your connection and try again.
            </AlertDescription>
          </Alert>
          <Button
            variant="ghost"
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            onClick={() => {
              void usage.refetch()
              void me.refetch()
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div role="status" aria-label="Loading usage">
          <Skeleton className="h-6 w-60 max-w-full rounded-full" />
        </div>
      )}
    </section>
  )
}

function DeletionSection() {
  return (
    <section aria-labelledby="delete" className="flex flex-col gap-2 pt-6">
      <h2
        id="delete"
        className="text-label tracking-wide text-muted-foreground uppercase"
      >
        Delete account
      </h2>
      <p className="text-sm text-muted-foreground">
        To delete your account and all your projects, email{" "}
        <a
          href={`mailto:${site.contactEmail}?subject=Delete%20my%20account`}
          className="font-medium text-primary-text underline underline-offset-4"
        >
          {site.contactEmail}
        </a>{" "}
        from the address you sign in with.
      </p>
    </section>
  )
}

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const

function AppearanceSection() {
  const { theme, setTheme } = useTheme()

  return (
    <section
      aria-labelledby="appearance"
      className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <h2
        id="appearance"
        className="text-label tracking-wide text-muted-foreground uppercase"
      >
        Theme
      </h2>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={theme}
        // Radix sends "" when the active item is pressed again; keep the current theme.
        onValueChange={(next) => {
          const match = THEMES.find((t) => t.value === next)
          if (match) setTheme(match.value)
        }}
        aria-labelledby="appearance"
        className="w-full sm:w-auto"
      >
        {THEMES.map((t) => (
          <ToggleGroupItem
            key={t.value}
            value={t.value}
            size="lg"
            className="flex-1 sm:flex-none"
          >
            {t.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  )
}

function SessionSection() {
  const navigate = useNavigate()
  const signOut = useSignOut()
  const signOutEverywhere = useSignOutEverywhere()
  const [confirming, setConfirming] = useState(false)
  const everywhereRef = useRef<HTMLButtonElement>(null)
  const busy = signOut.isPending || signOutEverywhere.isPending

  const toLanding = () => navigate({ to: "/" })

  return (
    <section aria-labelledby="session" className="flex flex-col gap-3 pt-6">
      <h2
        id="session"
        className="text-label tracking-wide text-muted-foreground uppercase"
      >
        Session
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() => signOut.mutate(undefined, { onSettled: toLanding })}
        >
          {signOut.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LogOut data-icon="inline-start" />
          )}
          Sign out
        </Button>
        <Button
          ref={everywhereRef}
          variant="ghost"
          size="lg"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Sign out on all devices
        </Button>
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={(next) => {
          if (!signOutEverywhere.isPending) setConfirming(next)
        }}
      >
        {/* Radix returns focus to an AlertDialogTrigger, and this dialog has none. */}
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            everywhereRef.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out on all devices?</AlertDialogTitle>
            <AlertDialogDescription>
              Every session ends, including this one. You'll need to sign in
              again everywhere.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signOutEverywhere.isPending}>
              Cancel
            </AlertDialogCancel>
            {/* A plain button, not AlertDialogAction, so the dialog stays open until the request settles. */}
            <Button
              disabled={signOutEverywhere.isPending}
              onClick={() =>
                signOutEverywhere.mutate(undefined, {
                  onSuccess: toLanding,
                  onError: () => {
                    setConfirming(false)
                    toast.error("Couldn't sign out everywhere. Try again.")
                  },
                })
              }
            >
              {signOutEverywhere.isPending && (
                <Spinner data-icon="inline-start" />
              )}
              Sign out
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
