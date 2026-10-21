import { AUDIO_FORMATS } from "@repo/shared/schemas"
import { CircleAlert, Loader2, Upload } from "lucide-react"
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatBytes, formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { UploadIllustration } from "./upload-illustration"
import type { PreparedFile, useUpload } from "./use-upload"

const ACCEPT = Object.keys(AUDIO_FORMATS)
  .map((ext) => `.${ext}`)
  .join(",")

type UploadController = ReturnType<typeof useUpload>

export function UploadPanel({
  upload,
  maxFileBytes,
}: {
  upload: UploadController
  maxFileBytes: number
}) {
  const { state } = upload
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
          className="flex flex-col items-center gap-3 rounded-4xl bg-surface px-6 py-12 text-center"
        >
          <Loader2 aria-hidden="true" className="size-6 animate-spin" />
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
        <FileCard prepared={state.prepared}>
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
        <FileCard prepared={state.prepared}>
          <Progress value={100} aria-label="Upload progress" />
          <p
            role="status"
            className="flex min-h-12 items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Almost there…
          </p>
        </FileCard>
      )
    case "failed":
      return (
        <FileCard prepared={state.prepared}>
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
              Choose another
            </Button>
          </div>
        </FileCard>
      )
  }
}

function FileCard({
  prepared,
  children,
}: {
  prepared: PreparedFile
  children: ReactNode
}) {
  return (
    <section
      aria-label="Upload"
      className="flex flex-col gap-4 rounded-4xl bg-surface p-5 sm:p-6"
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

function Dropzone({
  error,
  maxFileBytes,
  onFile,
}: {
  error: string | null
  maxFileBytes: number
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
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
    setActive(true)
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
    if (file) onFile(file)
  }

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
          "flex flex-col items-center gap-5 rounded-4xl border-2 border-dashed border-border-strong bg-surface px-5 py-8 text-center transition-colors sm:px-10 sm:py-12",
          "data-active:border-primary-text data-active:bg-primary-tint",
        )}
      >
        <UploadIllustration />
        <div className="flex flex-col gap-1">
          <p className="text-heading-3">
            {active ? "Drop it here" : "Add your mix"}
          </p>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Drag a file here, or choose one from your computer.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          aria-describedby="upload-limits"
          onClick={() => inputRef.current?.click()}
        >
          <Upload data-icon="inline-start" />
          Choose a file
        </Button>
        <p id="upload-limits" className="text-caption text-muted-foreground">
          WAV, MP3, FLAC or AAC · up to {formatBytes(maxFileBytes)} per file
        </p>
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
