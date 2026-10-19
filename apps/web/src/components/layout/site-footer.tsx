import { Link } from "@tanstack/react-router"
import { site } from "@/lib/site"

const linkClass =
  "rounded-sm py-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"

export function SiteFooter() {
  return (
    <footer className="border-t pb-[env(safe-area-inset-bottom)] text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-1 px-4 py-4 sm:flex-row sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {site.name}
        </p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link to="/privacy" className={linkClass}>
            Privacy
          </Link>
          <Link to="/terms" className={linkClass}>
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  )
}
