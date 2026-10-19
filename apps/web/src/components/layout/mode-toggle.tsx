import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/providers/theme-provider"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun className="hidden dark:block" />
          <Moon className="block dark:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem
          data-active={theme === "light"}
          onSelect={() => setTheme("light")}
        >
          <Sun />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem
          data-active={theme === "dark"}
          onSelect={() => setTheme("dark")}
        >
          <Moon />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          data-active={theme === "system"}
          onSelect={() => setTheme("system")}
        >
          <Monitor />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
