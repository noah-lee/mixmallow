import { NOTE_TEXT_MAX, noteTextSchema } from "@repo/shared/schemas"
import { CircleAlert } from "lucide-react"
import { type FormEvent, useEffect, useId, useRef, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { TimeChip } from "./note-row"

// "saved" resets the form; "closed" means the caller dealt with it (limit reached, note or
// track gone). The rest keep the form open with the text as typed.
export type NoteSaveResult =
  | "saved"
  | "closed"
  | "invalid-text"
  | "invalid-time"
  | "failed"

const COUNT_FROM = 1800
const NUDGE_MS = 1000

const textError = (value: string) => {
  if (noteTextSchema.safeParse(value).success) return null
  return value.trim() === ""
    ? "Write something first"
    : `Notes can be up to ${NOTE_TEXT_MAX.toLocaleString("en-US")} characters`
}

export function NoteForm({
  durationMs,
  playheadMs,
  initialTimeMs,
  initialText = "",
  disabled = false,
  autoFocus = false,
  alwaysShowCancel = true,
  onSave,
  onCancel,
}: {
  durationMs: number
  playheadMs: number
  // Without one, the time follows the playhead until the user nudges it or starts typing.
  initialTimeMs?: number
  initialText?: string
  disabled?: boolean
  autoFocus?: boolean
  alwaysShowCancel?: boolean
  onSave: (body: {
    timestampMs: number
    text: string
  }) => Promise<NoteSaveResult>
  onCancel: () => void
}) {
  const textId = useId()
  const errorId = useId()
  const countId = useId()
  const [pinnedMs, setPinnedMs] = useState<number | null>(initialTimeMs ?? null)
  const [text, setText] = useState(initialText)
  const [error, setError] = useState<string | null>(null)
  const [timeError, setTimeError] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) textRef.current?.focus()
  }, [autoFocus])

  const timeMs = pinnedMs ?? Math.round(playheadMs)
  const pin = () => {
    if (pinnedMs === null) setPinnedMs(timeMs)
  }
  const nudge = (delta: number) => {
    setPinnedMs(Math.min(durationMs, Math.max(0, timeMs + delta)))
    setTimeError(false)
  }
  const reset = () => {
    setPinnedMs(initialTimeMs ?? null)
    setText(initialText)
    setError(null)
    setTimeError(false)
    setFailed(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const invalid = textError(text)
    setError(invalid)
    setTimeError(false)
    setFailed(false)
    if (invalid) return
    setSaving(true)
    const result = await onSave({
      timestampMs: timeMs,
      text: text.trim(),
    }).finally(() => setSaving(false))
    if (result === "saved" || result === "closed") {
      setPinnedMs(null)
      setText("")
      return
    }
    if (result === "invalid-text") setError(textError(text) ?? "Check the note")
    if (result === "invalid-time") setTimeError(true)
    if (result === "failed") setFailed(true)
  }

  const dirty = text !== initialText || pinnedMs !== (initialTimeMs ?? null)
  const length = text.trim().length
  const busy = saving || disabled

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">At</span>
        <TimeChip ms={timeMs} className="text-base" />
        <span className="flex-1" />
        <Button
          type="button"
          variant="icon"
          size="icon"
          aria-label="1 second earlier"
          disabled={busy || timeMs <= 0}
          onClick={() => nudge(-NUDGE_MS)}
        >
          <span className="font-mono text-time font-semibold">−1s</span>
        </Button>
        <Button
          type="button"
          variant="icon"
          size="icon"
          aria-label="1 second later"
          disabled={busy || timeMs >= durationMs}
          onClick={() => nudge(NUDGE_MS)}
        >
          <span className="font-mono text-time font-semibold">+1s</span>
        </Button>
      </div>
      {timeError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          Must be within the track
        </p>
      )}
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={textId} className="sr-only">
          Note
        </FieldLabel>
        <Textarea
          id={textId}
          value={text}
          rows={3}
          disabled={disabled}
          ref={textRef}
          placeholder="What should change here?"
          className="max-h-[30svh] min-h-24 overflow-y-auto text-base md:text-base lg:max-h-80"
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? errorId : null, length > COUNT_FROM ? countId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onFocus={pin}
          onChange={(event) => {
            pin()
            setText(event.target.value)
            if (error) setError(textError(event.target.value))
          }}
        />
        <div className="flex items-start gap-2">
          {error && (
            <FieldError id={errorId} className="flex-1">
              {error}
            </FieldError>
          )}
          {length > COUNT_FROM && (
            <p
              id={countId}
              className={cn(
                "ml-auto font-mono text-caption tabular-nums",
                length > NOTE_TEXT_MAX
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {length.toLocaleString("en-US")} /{" "}
              {NOTE_TEXT_MAX.toLocaleString("en-US")}
            </p>
          )}
        </div>
      </Field>
      {failed && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Couldn't save the note</AlertTitle>
          <AlertDescription>
            Check your connection and try again.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={busy}>
          {saving && <Spinner data-icon="inline-start" />}
          Save
        </Button>
        {(alwaysShowCancel || dirty || failed) && (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              reset()
              onCancel()
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
