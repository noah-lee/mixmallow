import { useSyncExternalStore } from "react"

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

// Tailwind's `sm` breakpoint: below it, dialogs open as bottom sheets.
export const usePhone = () => useMediaQuery("(max-width: 639.98px)")
