import { Link, useMatch } from "@tanstack/react-router"
import { ModeToggle } from "@/components/layout/mode-toggle"
import { UserAvatar } from "@/components/layout/user-avatar"
import { useMe } from "@/features/auth/api"
import { SignInButton } from "@/features/auth/sign-in-button"
import { site } from "@/lib/site"

const focusRing =
  "rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function SiteHeader() {
  const me = useMe()
  // Only the landing route validates `next`; another page's ?next must not be carried.
  const next = useMatch({ from: "/", shouldThrow: false })?.search.next

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
      {/* 0.625rem plus the avatar's 6px inset in its 44px hit area matches the 1rem left edge. */}
      <div className="mx-auto flex h-15 max-w-280 items-center justify-between gap-2 pr-[max(0.625rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 lg:px-8">
        <Link
          to="/"
          className={`-ml-2 flex items-center gap-2 px-2 py-1 font-heading text-heading-3 font-extrabold ${focusRing}`}
        >
          <img src="/favicon.svg" alt="" className="size-9 shrink-0" />
          {site.name}
        </Link>
        <div className="flex items-center gap-1">
          <ModeToggle />
          {me.data ? (
            <>
              <Link
                to="/app/projects"
                className={`flex min-h-11 items-center px-3 text-sm font-semibold hover:bg-hover data-[status=active]:text-primary-text data-[status=active]:underline data-[status=active]:decoration-2 data-[status=active]:underline-offset-4 ${focusRing}`}
              >
                Projects
              </Link>
              {/* 44px hit area around the avatar, for touch. */}
              <Link
                to="/account"
                aria-label="Account"
                className={`flex size-11 items-center justify-center ${focusRing}`}
              >
                <UserAvatar user={me.data} />
              </Link>
            </>
          ) : (
            !me.isLoading && (
              <SignInButton variant="ghost" next={next}>
                Sign in
              </SignInButton>
            )
          )}
        </div>
      </div>
    </header>
  )
}
