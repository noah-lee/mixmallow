import type { Person } from "@repo/shared/schemas"

// Never falls back to an email: the api doesn't send one for other people.
export function personName(person: Person, meId?: string): string {
  if (person.id === meId) return "You"
  return person.name?.trim() || "Unnamed user"
}

// "Sam" for confirm copy; a nameless person keeps the full "Unnamed user".
export function personFirstName(person: Person): string {
  return person.name?.trim().split(/\s+/)[0] || "Unnamed user"
}
