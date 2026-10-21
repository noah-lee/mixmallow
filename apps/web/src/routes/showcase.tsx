import { createFileRoute } from "@tanstack/react-router"
import { Monitor, Moon, Sun } from "lucide-react"
import { useEffect } from "react"
import { PageLayout } from "@/components/layout/page-layout"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  BadgeSection,
  ButtonGroupSection,
  ButtonSection,
  KbdSection,
  ToggleGroupSection,
  ToggleSection,
} from "@/features/showcase/actions"
import {
  AccordionSection,
  AlertSection,
  AvatarSection,
  CardSection,
  CollapsibleSection,
  EmptySection,
  ItemSection,
  ProgressSection,
  ScrollAreaSection,
  SeparatorSection,
  SkeletonSection,
  SpinnerSection,
  TableSection,
  TabsSection,
} from "@/features/showcase/display"
import {
  CheckboxSection,
  FieldSection,
  InputGroupSection,
  InputSection,
  LabelSection,
  RadioGroupSection,
  SelectSection,
  SwitchSection,
  TextareaSection,
} from "@/features/showcase/forms"
import {
  ColourTokensSection,
  TypographySection,
} from "@/features/showcase/foundations"
import {
  AlertDialogSection,
  DialogSection,
  DrawerSection,
  DropdownMenuSection,
  PopoverSection,
  SheetSection,
  ToastSection,
  TooltipSection,
} from "@/features/showcase/overlays"
import { useTheme } from "@/providers/theme-provider"

// Public but unlinked: a reference sheet of every ui component in both themes.
export const Route = createFileRoute("/showcase")({
  component: Showcase,
})

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex"
    document.head.append(meta)
    return () => meta.remove()
  }, [])
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={theme}
      onValueChange={(value) => {
        if (value === "light" || value === "dark" || value === "system") {
          setTheme(value)
        }
      }}
      aria-label="Theme"
    >
      <ToggleGroupItem value="light">
        <Sun data-icon="inline-start" />
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark">
        <Moon data-icon="inline-start" />
        Dark
      </ToggleGroupItem>
      <ToggleGroupItem value="system">
        <Monitor data-icon="inline-start" />
        System
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function Showcase() {
  useNoIndex()

  return (
    <PageLayout>
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          <h1 className="text-heading-1">Component showcase</h1>
          <p className="text-muted-foreground">
            Every component in both themes, with its variants and states.
          </p>
          <ThemeSwitcher />
        </header>
        <TypographySection />
        <ColourTokensSection />
        <AccordionSection />
        <AlertSection />
        <AlertDialogSection />
        <AvatarSection />
        <BadgeSection />
        <ButtonSection />
        <ButtonGroupSection />
        <CardSection />
        <CheckboxSection />
        <CollapsibleSection />
        <DialogSection />
        <DrawerSection />
        <DropdownMenuSection />
        <EmptySection />
        <FieldSection />
        <InputSection />
        <InputGroupSection />
        <ItemSection />
        <KbdSection />
        <LabelSection />
        <PopoverSection />
        <ProgressSection />
        <RadioGroupSection />
        <ScrollAreaSection />
        <SelectSection />
        <SeparatorSection />
        <SheetSection />
        <SkeletonSection />
        <SpinnerSection />
        <SwitchSection />
        <TableSection />
        <TabsSection />
        <TextareaSection />
        <ToastSection />
        <ToggleSection />
        <ToggleGroupSection />
        <TooltipSection />
      </div>
    </PageLayout>
  )
}
