import { Search, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Demo, ShowcaseSection } from "@/features/showcase/showcase-section"

export function InputSection() {
  return (
    <ShowcaseSection title="Input">
      <Demo label="States" className="flex-col items-stretch">
        <Input aria-label="Empty" placeholder="Project name" />
        <Input aria-label="Filled" defaultValue="Summer EP" />
        <Input aria-label="Disabled" placeholder="Disabled" disabled />
        <Input aria-label="Invalid" defaultValue="??" aria-invalid />
        <Input aria-label="File" type="file" />
      </Demo>
    </ShowcaseSection>
  )
}

export function InputGroupSection() {
  return (
    <ShowcaseSection title="Input group">
      <Demo label="Addons" className="flex-col items-stretch">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search tracks"
            placeholder="Search tracks"
          />
        </InputGroup>
        <InputGroup>
          <InputGroupInput aria-label="Share link" defaultValue="mix-v3" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>.wav</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput aria-label="Filter" defaultValue="vocals" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Clear">
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput aria-label="Checking" defaultValue="Checking name" />
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        </InputGroup>
      </Demo>
      <Demo label="Textarea with footer" className="flex-col items-stretch">
        <InputGroup>
          <InputGroupTextarea
            aria-label="Note"
            placeholder="Leave a note at 01:24"
          />
          <InputGroupAddon align="block-end">
            <InputGroupText>0 / 500</InputGroupText>
            <InputGroupButton variant="default" size="sm" className="ml-auto">
              Post
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Demo>
      <Demo label="States" className="flex-col items-stretch">
        <InputGroup data-disabled="true">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Disabled search"
            placeholder="Disabled"
            disabled
          />
        </InputGroup>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Invalid search"
            defaultValue="??"
            aria-invalid
          />
        </InputGroup>
      </Demo>
    </ShowcaseSection>
  )
}

export function TextareaSection() {
  return (
    <ShowcaseSection title="Textarea">
      <Demo label="States" className="flex-col items-stretch">
        <Textarea aria-label="Empty note" placeholder="What should change?" />
        <Textarea aria-label="Disabled note" placeholder="Disabled" disabled />
        <Textarea
          aria-label="Invalid note"
          defaultValue="Too long…"
          aria-invalid
        />
      </Demo>
    </ShowcaseSection>
  )
}

export function LabelSection() {
  return (
    <ShowcaseSection title="Label">
      <Demo label="Paired with a control">
        <div className="flex items-center gap-2">
          <Checkbox id="label-demo" />
          <Label htmlFor="label-demo">Notify me about new versions</Label>
        </div>
      </Demo>
    </ShowcaseSection>
  )
}

export function FieldSection() {
  return (
    <ShowcaseSection title="Field">
      <FieldSet>
        <FieldLegend>Project details</FieldLegend>
        <FieldDescription>Shown to everyone you share with.</FieldDescription>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="field-name">Name</FieldLabel>
            <Input id="field-name" defaultValue="Summer EP" />
            <FieldDescription>Up to 80 characters.</FieldDescription>
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="field-artist">Artist</FieldLabel>
            <Input id="field-artist" aria-invalid defaultValue="" />
            <FieldError>Enter an artist name.</FieldError>
          </Field>
          <Field data-disabled="true">
            <FieldLabel htmlFor="field-owner">Owner</FieldLabel>
            <Input id="field-owner" defaultValue="e2e@example.com" disabled />
          </Field>
          <FieldSeparator>Or</FieldSeparator>
          <Field orientation="horizontal">
            <Switch id="field-public" />
            <FieldContent>
              <FieldLabel htmlFor="field-public">Public link</FieldLabel>
              <FieldDescription>
                Anyone with the link can listen.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </ShowcaseSection>
  )
}

export function CheckboxSection() {
  return (
    <ShowcaseSection title="Checkbox">
      <Demo label="States" className="flex-col items-start">
        {[
          { id: "cb-off", label: "Unchecked", props: {} },
          { id: "cb-on", label: "Checked", props: { defaultChecked: true } },
          { id: "cb-disabled", label: "Disabled", props: { disabled: true } },
          {
            id: "cb-disabled-on",
            label: "Disabled, checked",
            props: { disabled: true, defaultChecked: true },
          },
          {
            id: "cb-invalid",
            label: "Invalid",
            props: { "aria-invalid": true },
          },
        ].map(({ id, label, props }) => (
          <Field key={id} orientation="horizontal">
            <Checkbox id={id} {...props} />
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
          </Field>
        ))}
      </Demo>
    </ShowcaseSection>
  )
}

export function RadioGroupSection() {
  return (
    <ShowcaseSection title="Radio group">
      <Demo label="Options" className="block">
        <RadioGroup defaultValue="wav" aria-label="Download format">
          {[
            { value: "wav", label: "WAV" },
            { value: "mp3", label: "MP3" },
            { value: "flac", label: "FLAC (disabled)", disabled: true },
          ].map(({ value, label, disabled }) => (
            <Field key={value} orientation="horizontal">
              <RadioGroupItem
                id={`radio-${value}`}
                value={value}
                disabled={disabled ?? false}
              />
              <FieldLabel htmlFor={`radio-${value}`}>{label}</FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </Demo>
      <Demo label="Invalid" className="block">
        <RadioGroup aria-label="Required choice">
          <Field orientation="horizontal">
            <RadioGroupItem id="radio-invalid" value="x" aria-invalid />
            <FieldLabel htmlFor="radio-invalid">Pick one</FieldLabel>
          </Field>
        </RadioGroup>
      </Demo>
    </ShowcaseSection>
  )
}

export function SwitchSection() {
  return (
    <ShowcaseSection title="Switch">
      {(["default", "sm"] as const).map((size) => (
        <Demo key={size} label={size}>
          <Switch size={size} aria-label={`Off (${size})`} />
          <Switch size={size} aria-label={`On (${size})`} defaultChecked />
          <Switch size={size} aria-label={`Disabled (${size})`} disabled />
          <Switch size={size} aria-label={`Invalid (${size})`} aria-invalid />
        </Demo>
      ))}
    </ShowcaseSection>
  )
}

function SampleSelect(props: {
  label: string
  size?: "sm" | "default"
  disabled?: boolean
  invalid?: boolean
  defaultValue?: string
}) {
  return (
    <Select
      disabled={props.disabled ?? false}
      {...(props.defaultValue ? { defaultValue: props.defaultValue } : {})}
    >
      <SelectTrigger
        size={props.size ?? "default"}
        aria-label={props.label}
        aria-invalid={props.invalid ?? false}
        className="w-44"
      >
        <SelectValue placeholder="Pick a version" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Versions</SelectLabel>
          <SelectItem value="v3">v3 — final</SelectItem>
          <SelectItem value="v2">v2 — louder</SelectItem>
          <SelectItem value="v1">v1 — rough</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectItem value="old" disabled>
          Archived
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

export function SelectSection() {
  return (
    <ShowcaseSection title="Select">
      <Demo label="Sizes">
        <SampleSelect label="Version (default)" />
        <SampleSelect label="Version (sm)" size="sm" />
      </Demo>
      <Demo label="States">
        <SampleSelect label="Version (filled)" defaultValue="v3" />
        <SampleSelect label="Version (disabled)" disabled />
        <SampleSelect label="Version (invalid)" invalid />
      </Demo>
    </ShowcaseSection>
  )
}
