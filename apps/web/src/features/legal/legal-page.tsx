import type { ReactNode } from "react"
import { PageLayout } from "@/components/layout/page-layout"
import { site } from "@/lib/site"

export function LegalPage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <PageLayout>
      <article className="flex flex-col gap-8 leading-relaxed">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-heading-1">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {site.legalUpdated}
          </p>
        </div>
        {children}
      </article>
    </PageLayout>
  )
}

export function LegalSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 [&_a]:font-medium [&_a]:text-primary-text [&_a]:underline [&_a]:underline-offset-4 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
      <h2 className="font-heading text-heading-2">{title}</h2>
      {children}
    </section>
  )
}

export function ContactLink() {
  return <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
}
