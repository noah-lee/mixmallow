import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Italic,
  Pause,
  Play,
  Repeat,
  Upload,
} from "lucide-react"
import type { ComponentProps } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Demo, ShowcaseSection } from "@/features/showcase/showcase-section"

type ButtonProps = ComponentProps<typeof Button>
type ButtonVariant = NonNullable<ButtonProps["variant"]>
type ButtonSize = NonNullable<ButtonProps["size"]>

const buttonVariants: ButtonVariant[] = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
  "icon",
  "play",
]
const textSizes: ButtonSize[] = ["xs", "sm", "default", "lg"]
const iconSizes: ButtonSize[] = [
  "icon-xs",
  "icon-sm",
  "icon",
  "icon-lg",
  "play",
]

export function ButtonSection() {
  return (
    <ShowcaseSection title="Button">
      {buttonVariants.map((variant) => (
        <Demo key={variant} label={variant}>
          {textSizes.map((size) => (
            <Button key={size} variant={variant} size={size}>
              {size}
            </Button>
          ))}
          {iconSizes.map((size) => (
            <Button
              key={size}
              variant={variant}
              size={size}
              aria-label={`Play (${size})`}
            >
              <Play />
            </Button>
          ))}
        </Demo>
      ))}
      <Demo label="With icon">
        <Button>
          <Upload data-icon="inline-start" />
          Upload mix
        </Button>
        <Button variant="outline">
          Versions
          <ChevronDown data-icon="inline-end" />
        </Button>
      </Demo>
      <Demo label="States">
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
        <Button disabled>
          <Spinner data-icon="inline-start" />
          Uploading
        </Button>
        <Button variant="outline" aria-invalid>
          Invalid
        </Button>
        <Button variant="play" size="play" aria-label="Pause">
          <Pause />
        </Button>
      </Demo>
    </ShowcaseSection>
  )
}

export function ButtonGroupSection() {
  return (
    <ShowcaseSection title="Button group">
      <Demo label="Horizontal">
        <ButtonGroup>
          <Button variant="outline">Previous</Button>
          <Button variant="outline">Next</Button>
        </ButtonGroup>
        <ButtonGroup>
          <ButtonGroupText>v3</ButtonGroupText>
          <Button variant="outline">Compare</Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button>Share</Button>
          <ButtonGroupSeparator />
          <Button size="icon" aria-label="More share options">
            <ChevronDown />
          </Button>
        </ButtonGroup>
      </Demo>
      <Demo label="Vertical">
        <ButtonGroup orientation="vertical">
          <Button variant="outline">Intro</Button>
          <Button variant="outline">Verse</Button>
          <Button variant="outline">Chorus</Button>
        </ButtonGroup>
      </Demo>
    </ShowcaseSection>
  )
}

const badgeVariants = [
  "default",
  "secondary",
  "tint",
  "outline",
  "ghost",
  "link",
  "success",
  "warning",
  "destructive",
] as const

export function BadgeSection() {
  return (
    <ShowcaseSection title="Badge">
      <Demo label="Variants">
        {badgeVariants.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </Demo>
      <Demo label="With icon and invalid">
        <Badge variant="tint">
          <Repeat data-icon="inline-start" />
          Looping
        </Badge>
        <Badge variant="outline" aria-invalid>
          Invalid
        </Badge>
      </Demo>
    </ShowcaseSection>
  )
}

const toggleVariants = ["default", "outline"] as const
const toggleSizes = ["sm", "default", "lg"] as const

export function ToggleSection() {
  return (
    <ShowcaseSection title="Toggle">
      {toggleVariants.map((variant) => (
        <Demo key={variant} label={variant}>
          {toggleSizes.map((size) => (
            <Toggle
              key={size}
              variant={variant}
              size={size}
              aria-label={`Bold (${size})`}
            >
              <Bold />
            </Toggle>
          ))}
          <Toggle variant={variant} defaultPressed>
            <Repeat data-icon="inline-start" />
            Loop
          </Toggle>
        </Demo>
      ))}
      <Demo label="States">
        <Toggle disabled aria-label="Italic (disabled)">
          <Italic />
        </Toggle>
        <Toggle variant="outline" aria-invalid aria-label="Italic (invalid)">
          <Italic />
        </Toggle>
      </Demo>
    </ShowcaseSection>
  )
}

export function ToggleGroupSection() {
  return (
    <ShowcaseSection title="Toggle group">
      {toggleVariants.map((variant) => (
        <Demo key={variant} label={variant}>
          {toggleSizes.map((size) => (
            <ToggleGroup
              key={size}
              type="single"
              variant={variant}
              size={size}
              defaultValue="left"
              aria-label={`Alignment (${size})`}
            >
              <ToggleGroupItem value="left" aria-label="Align left">
                <AlignLeft />
              </ToggleGroupItem>
              <ToggleGroupItem value="center" aria-label="Align center">
                <AlignCenter />
              </ToggleGroupItem>
              <ToggleGroupItem value="right" aria-label="Align right">
                <AlignRight />
              </ToggleGroupItem>
            </ToggleGroup>
          ))}
        </Demo>
      ))}
      <Demo label="Joined, multiple, disabled">
        <ToggleGroup
          type="multiple"
          variant="outline"
          spacing={0}
          defaultValue={["bold"]}
          aria-label="Text style"
        >
          <ToggleGroupItem value="bold" aria-label="Bold">
            <Bold />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <Italic />
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" disabled aria-label="Disabled group">
          <ToggleGroupItem value="a">Off</ToggleGroupItem>
          <ToggleGroupItem value="b">On</ToggleGroupItem>
        </ToggleGroup>
      </Demo>
    </ShowcaseSection>
  )
}

export function KbdSection() {
  return (
    <ShowcaseSection title="Kbd">
      <Demo label="Keys">
        <Kbd>Space</Kbd>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <span>+</span>
          <Kbd>K</Kbd>
        </KbdGroup>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
      </Demo>
    </ShowcaseSection>
  )
}
