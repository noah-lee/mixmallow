import type { MeResponse } from "@repo/shared/schemas"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

function initials(user: MeResponse) {
  const words = user.name?.trim().split(/\s+/) ?? []
  const first = words[0]?.[0]
  if (!first) return user.email.slice(0, 1).toUpperCase()
  const last = words.length > 1 ? words[words.length - 1]?.[0] : ""
  return `${first}${last ?? ""}`.toUpperCase()
}

export function UserAvatar({
  user,
  size = "default",
}: {
  user: MeResponse
  size?: "default" | "sm" | "lg"
}) {
  return (
    <Avatar size={size}>
      {user.picture && (
        // Google's avatar CDN rejects requests that carry a Referer from another origin.
        <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback>{initials(user)}</AvatarFallback>
    </Avatar>
  )
}
