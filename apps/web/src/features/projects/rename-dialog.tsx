import { NAME_MAX, nameSchema } from "@repo/shared/schemas"
import { CircleAlert } from "lucide-react"
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { usePhone } from "@/lib/use-media-query"

// "saved" and "gone" close the dialog (the caller handles what "gone" means: deleted, or
// not this user's to change); the others keep it open with the input as typed.
export type RenameResult = "saved" | "gone" | "invalid" | "failed"

const nameError = (value: string) => {
  const result = nameSchema.safeParse(value)
  if (result.success) return null
  return value.trim() === ""
    ? "Enter a name"
    : `Names can be up to ${NAME_MAX} characters`
}

export function RenameDialog({
  open,
  onOpenChange,
  title,
  description,
  currentName,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  currentName: string
  onSave: (name: string) => Promise<RenameResult>
}) {
  const phone = usePhone()
  const formId = useId()
  const inputId = useId()
  const errorId = useId()
  const [value, setValue] = useState(currentName)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setValue(currentName)
    setFieldError(null)
    setFailed(false)
  }, [open, currentName])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const error = nameError(value)
    setFieldError(error)
    setFailed(false)
    if (error) return
    setSaving(true)
    const result = await onSave(value.trim()).finally(() => setSaving(false))
    if (result === "invalid") setFieldError(`Use 1 to ${NAME_MAX} characters`)
    if (result === "failed") setFailed(true)
    if (result === "saved" || result === "gone") onOpenChange(false)
  }

  const setOpen = (next: boolean) => {
    if (!saving) onOpenChange(next)
  }

  const form = (
    <form
      id={formId}
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-4"
    >
      <Field data-invalid={fieldError ? true : undefined}>
        <FieldLabel htmlFor={inputId}>Name</FieldLabel>
        <Input
          id={inputId}
          value={value}
          autoComplete="off"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errorId : undefined}
          onChange={(event) => {
            setValue(event.target.value)
            if (fieldError) setFieldError(nameError(event.target.value))
          }}
        />
        {fieldError && <FieldError id={errorId}>{fieldError}</FieldError>}
      </Field>
      {failed && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Couldn't rename</AlertTitle>
          <AlertDescription>
            Check your connection and try again.
          </AlertDescription>
        </Alert>
      )}
    </form>
  )

  const actions: ReactNode = (
    <>
      <Button type="submit" form={formId} disabled={saving}>
        {saving && <Spinner data-icon="inline-start" />}
        Save
      </Button>
      <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </>
  )

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{form}</div>
          <DrawerFooter>{actions}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {form}
        <DialogFooter className="sm:flex-row-reverse sm:justify-start">
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
