import { AUDIO_FORMATS } from "@repo/shared/schemas"
import { CircleAlert, Upload } from "lucide-react"
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { formatBytes, formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { UploadIllustration } from "./upload-illustration"
import { type PreparedFile, uploadMessages, type useUpload } from "./use-upload"

const ACCEPT = Object.keys(AUDIO_FORMATS)
  .map((ext) => `.${ext}`)
  .join(",")

type UploadController = ReturnType<typeof useUpload>

// `row` is the project page's version of the in-progress states: a card at the top of the
// versions list, where giving up on a failed upload removes the row.
export function UploadPanel({
  upload,
  maxFileBytes,
  variant = "panel",
}: {
  upload: UploadController
  maxFileBytes: number
  variant?: "panel" | "row"
}) {
  const { state } = upload
  const row = variant === "row"
  switch (state.status) {
    case "idle":
      return (
        <Dropzone
          error={state.error}
          maxFileBytes={maxFileBytes}
          onFile={(file) => void upload.choose(file)}
        />
      )
    case "reading":
      return (
        <section
          aria-label="Upload"
          className={cn(
            "flex flex-col items-center gap-3 bg-surface text-center",
            row ? "rounded-xl px-5 py-6" : "rounded-4xl px-6 py-12",
          )}
        >
          <Spinner aria-hidden="true" role="presentation" className="size-6" />
          <p role="status" className="font-semibold">
            Reading waveform…
          </p>
          <p className="max-w-full text-sm break-words text-muted-foreground">
            {state.file.name}
          </p>
        </section>
      )
    case "uploading":
      return (
        <FileCard prepared={state.prepared} row={row}>
          <div className="flex items-center gap-3">
            <Progress
              value={state.percent}
              aria-label="Upload progress"
              className="flex-1"
            />
            <span className="w-11 text-right font-mono text-time tabular-nums">
              {state.percent}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted-foreground">
              Uploading…
            </p>
            <Button variant="ghost" className="-mr-3" onClick={upload.cancel}>
              Cancel
            </Button>
          </div>
        </FileCard>
      )
    case "finishing":
      return (
        <FileCard prepared={state.prepared} row={row}>
          <Progress value={100} aria-label="Upload progress" />
          <p
            role="status"
            className="flex min-h-12 items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden="true" role="presentation" />
            Almost there…
          </p>
        </FileCard>
      )
    case "failed":
      return (
        <FileCard prepared={state.prepared} row={row}>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Upload failed</AlertTitle>
            <AlertDescription>
              Check your connection and try again.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" onClick={upload.retry}>
              Try again
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={upload.chooseAnother}
            >
              {row ? "Remove" : "Choose another"}
            </Button>
          </div>
        </FileCard>
      )
    case "refused":
      return (
        <FileCard prepared={state.prepared} row={row}>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{uploadMessages.refused}</AlertTitle>
          </Alert>
          <Button
            variant="ghost"
            className="w-full sm:w-auto sm:self-start"
            onClick={upload.chooseAnother}
          >
            Choose another
          </Button>
        </FileCard>
      )
  }
}

function FileCard({
  prepared,
  row,
  children,
}: {
  prepared: PreparedFile
  row: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-label="Upload"
      className={cn(
        "flex flex-col gap-4 bg-surface",
        row ? "rounded-xl p-4 sm:p-5" : "rounded-4xl p-5 sm:p-6",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold break-words">{prepared.file.name}</p>
        <p className="text-sm text-muted-foreground">
          {formatBytes(prepared.file.size)} ·{" "}
          <span className="font-mono tabular-nums">
            {formatDuration(prepared.durationMs)}
          </span>
        </p>
      </div>
      {children}
    </section>
  )
}

// `compact` is the project page's: no illustration, a single line beside the button from
// `sm`. `notice` replaces the limits line (storage full).
export function Dropzone({
  error,
  maxFileBytes,
  onFile,
  compact = false,
  title = "Add your mix",
  description,
  buttonLabel = "Choose a file",
  disabled = false,
  notice,
}: {
  error: string | null
  maxFileBytes: number
  onFile: (file: File) => void
  compact?: boolean
  title?: string
  description?: string
  buttonLabel?: string
  disabled?: boolean
  notice?: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const limitsId = useId()
  const [active, setActive] = useState(false)

  // A file dropped beside the dropzone would otherwise open in the tab and leave the app.
  useEffect(() => {
    const block = (event: globalThis.DragEvent) => event.preventDefault()
    window.addEventListener("dragover", block)
    window.addEventListener("drop", block)
    return () => {
      window.removeEventListener("dragover", block)
      window.removeEventListener("drop", block)
    }
  }, [])

  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    if (!disabled) setActive(true)
  }
  const onDragLeave = (event: DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setActive(false)
    }
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setActive(false)
    const file = event.dataTransfer.files[0]
    if (file && !disabled) onFile(file)
  }

  const button = (
    <Button
      className="w-full sm:w-auto"
      aria-describedby={limitsId}
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
    >
      <Upload data-icon="inline-start" />
      {buttonLabel}
    </Button>
  )
  const limits = (
    <div id={limitsId} className="text-caption text-muted-foreground">
      {notice ?? (
        <p>
          WAV, MP3, FLAC or AAC · up to {formatBytes(maxFileBytes)} per file
        </p>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Upload"
        data-active={active || undefined}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "flex rounded-4xl border-2 border-dashed border-border-strong bg-surface transition-colors",
          "data-active:border-primary-text data-active:bg-primary-tint",
          compact
            ? "flex-col gap-3 p-4 sm:flex-row-reverse sm:items-center sm:justify-between sm:gap-6 sm:py-4 sm:pr-4 sm:pl-6"
            : "flex-col items-center gap-5 px-6 py-8 text-center sm:px-10 sm:py-12",
        )}
      >
        {compact ? (
          <>
            {button}
            <div className="flex flex-col gap-0.5 text-center sm:text-left">
              <p className="hidden font-semibold sm:block">
                {active ? "Drop it here" : title}
              </p>
              {limits}
            </div>
          </>
        ) : (
          <>
            <UploadIllustration />
            <div className="flex flex-col gap-1">
              <p className="text-heading-3">
                {active ? "Drop it here" : title}
              </p>
              {/* The default line is about dragging, which phones can't do. */}
              <p
                className={cn(
                  "text-sm text-muted-foreground",
                  !description && "hidden sm:block",
                )}
              >
                {description ??
                  "Drag a file here, or choose one from your computer."}
              </p>
            </div>
            {button}
            {limits}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Cleared so picking the same file again still fires a change.
            event.target.value = ""
            if (file) onFile(file)
          }}
        />
      </section>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
