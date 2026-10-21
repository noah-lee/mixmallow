import { MB } from "@repo/shared/schemas"

// Binary megabytes, matching the server's limits: "41.2 MB", "100 MB", "640 KB".
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB"
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / MB).toFixed(1).replace(/\.0$/, "")} MB`
}

// "4:12", or "1:04:12" past an hour.
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}

// "Oct 18", with the year when it isn't this year: "Oct 18, 2025".
export function formatShortDate(iso: string, now = new Date()): string {
  const date = new Date(iso)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
