import type { ReactNode } from "react"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { cn } from "@/lib/utils"

// Header + footer around a page. Phone first: full-width with a 1rem gutter (clear of the
// notch in landscape), widening to `max-w-2xl` with more padding from `sm` up.
export function PageLayout({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main
        className={cn(
          "mx-auto flex w-full max-w-2xl flex-1 flex-col pt-6 pr-[max(1rem,env(safe-area-inset-right))] pb-10 pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 sm:pt-10",
          className,
        )}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
