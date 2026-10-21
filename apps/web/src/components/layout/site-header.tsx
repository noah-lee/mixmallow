import { Link } from "@tanstack/react-router"
import { ModeToggle } from "@/components/layout/mode-toggle"
import { UserAvatar } from "@/components/layout/user-avatar"
import { useMe } from "@/features/auth/api"
import { SignInButton } from "@/features/auth/sign-in-button"
import { site } from "@/lib/site"

const focusRing =
  "rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function SiteHeader() {
  const me = useMe()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-15 max-w-280 items-center justify-between gap-2 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 lg:px-8">
        <Link
          to="/"
          className={`-ml-2 px-2 py-1 font-heading text-heading-3 font-extrabold ${focusRing}`}
        >
          {site.name}
        </Link>
        <div className="flex items-center gap-1">
          <ModeToggle />
          {me.data ? (
            // 44px hit area around the avatar, for touch.
            <Link
              to="/account"
              aria-label="Account"
              className={`flex size-11 items-center justify-center ${focusRing}`}
            >
              <UserAvatar user={me.data} />
            </Link>
          ) : (
            !me.isLoading && (
              <SignInButton variant="ghost">Sign in</SignInButton>
            )
          )}
        </div>
      </div>
    </header>
  )
}
