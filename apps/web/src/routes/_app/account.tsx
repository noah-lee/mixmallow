import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { LogOut } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { UserAvatar } from "@/components/layout/user-avatar"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMe, useSignOut, useSignOutEverywhere } from "@/features/auth/api"
import { BillingSection } from "@/features/billing/billing-section"
import { useTheme } from "@/providers/theme-provider"

export const Route = createFileRoute("/_app/account")({
  component: Account,
})

function Account() {
  // Live, so a billing sync after checkout shows up. The guard's snapshot covers sign-out,
  // which nulls `me` before navigating away.
  const { me: snapshot } = Route.useRouteContext()
  const me = useMe().data ?? snapshot

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Account</h1>
      <section aria-label="Profile" className="flex items-center gap-4 pb-6">
        <UserAvatar user={me} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{me.name ?? me.email}</span>
            {me.isPremium && <Badge>Premium</Badge>}
          </p>
          {me.name && (
            <p
              title={me.email}
              className="truncate text-sm text-muted-foreground"
            >
              {me.email}
            </p>
          )}
        </div>
      </section>
      <Separator />
      <BillingSection user={me} />
      <Separator />
      <AppearanceSection />
      <Separator />
      <SessionSection />
    </div>
  )
}

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const

function AppearanceSection() {
  const { theme, setTheme } = useTheme()

  return (
    <section
      aria-labelledby="appearance"
      className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <h2 id="appearance" className="text-sm font-medium text-muted-foreground">
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

  const callbacks = {
    onSuccess: () => navigate({ to: "/" }),
    onError: () => {
      setConfirming(false)
      toast.error("Couldn't sign out. Try again.")
    },
  }

  return (
    <section aria-labelledby="session" className="flex flex-col gap-3 pt-6">
      <h2 id="session" className="text-sm font-medium text-muted-foreground">
        Session
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          size="lg"
          disabled={busy}
          onClick={() => signOut.mutate(undefined, callbacks)}
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
              onClick={() => signOutEverywhere.mutate(undefined, callbacks)}
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
