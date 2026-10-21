import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
}

export function ShowcaseSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const id = `showcase-${slug(title)}`
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-6 border-t border-border pt-8"
    >
      <h2 id={id} className="text-heading-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function Demo({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-label text-muted-foreground uppercase">{label}</h3>
      <div className={cn("flex flex-wrap items-center gap-3", className)}>
        {children}
      </div>
    </div>
  )
}
