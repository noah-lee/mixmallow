import { MB } from "@repo/shared/schemas"

// Binary megabytes, matching the server's limits: "41.2 MB", "100 MB", "640 KB".
export function formatBytes(bytes: number): string {
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
