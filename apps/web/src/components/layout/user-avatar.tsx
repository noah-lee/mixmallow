import type { MeResponse } from "@repo/shared/schemas"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

type AvatarPerson = { name: string | null; picture: string | null }

function initials(name: string | null): string | undefined {
  const words = name?.trim().split(/\s+/) ?? []
  const first = words[0]?.[0]
  if (!first) return undefined
  const last = words.length > 1 ? words[words.length - 1]?.[0] : ""
  return `${first}${last ?? ""}`.toUpperCase()
}

// For other people: the api never sends their email, so a nameless person shows "?".
export function PersonAvatar({
  person,
  size = "default",
  className,
  fallback,
}: {
  person: AvatarPerson
  size?: "default" | "sm" | "lg"
  className?: string
  fallback?: string
}) {
  return (
    <Avatar size={size} {...(className ? { className } : {})}>
      {person.picture && (
        // Google's avatar CDN rejects requests that carry a Referer from another origin.
        <AvatarImage src={person.picture} alt="" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback>
        {initials(person.name) ?? fallback ?? "?"}
      </AvatarFallback>
    </Avatar>
  )
}

export function UserAvatar({
  user,
  size = "default",
}: {
  user: MeResponse
  size?: "default" | "sm" | "lg"
}) {
  return (
    <PersonAvatar
      person={user}
      size={size}
      fallback={user.email.slice(0, 1).toUpperCase()}
    />
  )
}
