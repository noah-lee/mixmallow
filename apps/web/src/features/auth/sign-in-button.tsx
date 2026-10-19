import type { AuthProvider } from "@repo/shared/schemas"
import { type ComponentProps, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { authProviderLabels, signIn } from "@/features/auth/api"
import { cn } from "@/lib/utils"

export function SignInButton({
  provider = "google",
  onStart,
  className,
  children = `Sign in with ${authProviderLabels[provider]}`,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "asChild"> & {
  provider?: AuthProvider
  onStart?: () => void
}) {
  const [redirecting, setRedirecting] = useState(false)

  // The page normally unloads mid-redirect, so this never resets on its own.
  // Coming back with the browser's back button can restore it from bfcache, still busy.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setRedirecting(false)
    }
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])

  return (
    // aria-disabled, not disabled: a disabled button drops keyboard focus to <body> mid-redirect.
    <Button
      {...props}
      className={cn("aria-disabled:pointer-events-none", className)}
      aria-disabled={redirecting}
      aria-busy={redirecting}
      onClick={() => {
        if (redirecting) return
        setRedirecting(true)
        onStart?.()
        signIn(provider)
      }}
    >
      {redirecting && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  )
}
