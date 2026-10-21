import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The custom type scale in index.css; without this twMerge reads `text-label` etc. as a
// colour and drops it when a `text-<colour>` class is also present.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "display-desktop",
            "heading-1",
            "heading-2",
            "heading-3",
            "caption",
            "label",
            "time",
            "time-lg",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
