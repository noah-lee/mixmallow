import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

export function UsageMeter({
  usedBytes,
  limitBytes,
}: {
  usedBytes: number
  limitBytes: number
}) {
  const fraction = limitBytes > 0 ? Math.min(1, usedBytes / limitBytes) : 1
  const high = fraction > 0.9

  return (
    <div
      data-high={high || undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-full bg-surface px-4 py-2 sm:w-auto sm:self-start",
        "data-high:bg-warning-tint",
      )}
    >
      <p className="text-caption whitespace-nowrap">
        <span className="sr-only">Storage used: </span>
        {formatBytes(usedBytes)} of {formatBytes(limitBytes)}
      </p>
      {/* The text above says it all; the bar is a picture of it. */}
      <span
        aria-hidden="true"
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted sm:w-24 sm:flex-none"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            high ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </span>
    </div>
  )
}
