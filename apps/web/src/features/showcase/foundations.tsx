import { Demo, ShowcaseSection } from "@/features/showcase/showcase-section"

const typeScale = [
  { name: "display", className: "text-display sm:text-display-desktop" },
  { name: "heading-1", className: "text-heading-1" },
  { name: "heading-2", className: "text-heading-2" },
  { name: "heading-3", className: "text-heading-3" },
  { name: "base", className: "text-base" },
  { name: "sm", className: "text-sm" },
  { name: "caption", className: "text-caption" },
  { name: "label", className: "text-label uppercase" },
]

const textColours = [
  { name: "foreground", className: "text-foreground" },
  { name: "muted-foreground", className: "text-muted-foreground" },
  { name: "subtle-foreground", className: "text-subtle-foreground" },
  { name: "primary-text", className: "text-primary-text" },
  { name: "destructive", className: "text-destructive" },
  { name: "success", className: "text-success" },
  { name: "warning", className: "text-warning" },
]

export function TypographySection() {
  return (
    <ShowcaseSection title="Typography">
      <Demo label="Scale" className="flex-col items-start gap-4">
        {typeScale.map(({ name, className }) => (
          <div key={name} className="flex flex-col gap-1">
            <span className="font-mono text-xs text-muted-foreground">
              {name}
            </span>
            <span className={className}>Second verse, louder chorus</span>
          </div>
        ))}
      </Demo>
      <Demo label="Timestamps" className="items-baseline gap-6">
        <span className="font-mono text-time">01:24</span>
        <span className="font-mono text-time-lg">03:47.250</span>
      </Demo>
      <Demo label="Text colours" className="flex-col items-start gap-1">
        {textColours.map(({ name, className }) => (
          <span key={name} className={className}>
            {name}
          </span>
        ))}
      </Demo>
      <Demo label="Inline" className="block">
        <p>
          Body copy with <strong className="font-bold">bold</strong>,{" "}
          <a
            className="text-primary-text underline underline-offset-4"
            href="#showcase-typography"
          >
            a link back to this section
          </a>{" "}
          and <code className="font-mono text-sm">inline code</code>.
        </p>
      </Demo>
    </ShowcaseSection>
  )
}

// Tailwind only generates classes it can see whole, so every swatch class is spelled out.
const colourGroups = [
  {
    label: "Surfaces",
    tokens: [
      { name: "background", className: "bg-background" },
      { name: "surface", className: "bg-surface" },
      { name: "card", className: "bg-card" },
      { name: "popover", className: "bg-popover" },
      { name: "secondary", className: "bg-secondary" },
      { name: "muted", className: "bg-muted" },
      { name: "accent", className: "bg-accent" },
    ],
  },
  {
    label: "Text",
    tokens: [
      { name: "foreground", className: "bg-foreground" },
      { name: "muted-foreground", className: "bg-muted-foreground" },
      { name: "subtle-foreground", className: "bg-subtle-foreground" },
    ],
  },
  {
    label: "Brand",
    tokens: [
      { name: "primary", className: "bg-primary" },
      { name: "primary-pressed", className: "bg-primary-pressed" },
      { name: "primary-text", className: "bg-primary-text" },
      { name: "primary-tint", className: "bg-primary-tint" },
      { name: "primary-foreground", className: "bg-primary-foreground" },
    ],
  },
  {
    label: "Status",
    tokens: [
      { name: "destructive", className: "bg-destructive" },
      { name: "destructive-tint", className: "bg-destructive-tint" },
      { name: "success", className: "bg-success" },
      { name: "success-tint", className: "bg-success-tint" },
      { name: "warning", className: "bg-warning" },
      { name: "warning-tint", className: "bg-warning-tint" },
    ],
  },
  {
    label: "Lines",
    tokens: [
      { name: "border", className: "bg-border" },
      { name: "border-strong", className: "bg-border-strong" },
      { name: "input", className: "bg-input" },
      { name: "ring", className: "bg-ring" },
    ],
  },
  {
    label: "Waveform",
    tokens: [
      { name: "wave", className: "bg-wave" },
      { name: "wave-played", className: "bg-wave-played" },
      { name: "playhead", className: "bg-playhead" },
      { name: "marker", className: "bg-marker" },
      { name: "marker-done", className: "bg-marker-done" },
    ],
  },
  {
    label: "Tints",
    tokens: [
      { name: "tint-lavender", className: "bg-tint-lavender" },
      { name: "tint-mint", className: "bg-tint-mint" },
      { name: "tint-butter", className: "bg-tint-butter" },
    ],
  },
]

const pairings = [
  {
    name: "foreground on background",
    className: "bg-background text-foreground",
  },
  {
    name: "card-foreground on card",
    className: "bg-card text-card-foreground",
  },
  {
    name: "primary-foreground on primary",
    className: "bg-primary text-primary-foreground",
  },
  {
    name: "primary-text on primary-tint",
    className: "bg-primary-tint text-primary-text",
  },
  {
    name: "destructive-foreground on destructive",
    className: "bg-destructive text-destructive-foreground",
  },
  {
    name: "destructive on destructive-tint",
    className: "bg-destructive-tint text-destructive",
  },
  {
    name: "success on success-tint",
    className: "bg-success-tint text-success",
  },
  {
    name: "warning on warning-tint",
    className: "bg-warning-tint text-warning",
  },
]

export function ColourTokensSection() {
  return (
    <ShowcaseSection title="Colour tokens">
      {colourGroups.map(({ label, tokens }) => (
        <Demo
          key={label}
          label={label}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {tokens.map(({ name, className }) => (
            <div key={name} className="flex min-w-0 flex-col gap-1.5">
              <div
                className={`h-12 rounded-md border border-border ${className}`}
              />
              <span className="truncate font-mono text-xs text-muted-foreground">
                {name}
              </span>
            </div>
          ))}
        </Demo>
      ))}
      <Demo label="Pairings" className="grid gap-2 sm:grid-cols-2">
        {pairings.map(({ name, className }) => (
          <div
            key={name}
            className={`rounded-md border border-border px-4 py-3 text-sm font-medium ${className}`}
          >
            {name}
          </div>
        ))}
      </Demo>
    </ShowcaseSection>
  )
}
