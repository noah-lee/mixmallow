import {
  type AudioFormat,
  type CompleteUploadBody,
  type CreateUploadBody,
  type CreateUploadResponse,
  completeUploadResponseSchema,
  createUploadResponseSchema,
  fileExtension,
  formatList,
  isAudioFileName,
  MAX_DURATION_MS,
} from "@repo/shared/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { PROJECTS_QUERY_KEY, projectKey } from "@/features/projects/api"
import { USAGE_QUERY_KEY } from "@/features/usage/api"
import { api, apiErrorCode, httpStatus } from "@/lib/api"
import { formatBytes } from "@/lib/format"
import { decodeAudio } from "./audio"

export type PreparedFile = {
  file: File
  durationMs: number
  peaks: number[]
}

export type UploadState =
  // `error` is the inline message for a rejected file; the picker stays usable.
  | { status: "idle"; error: string | null }
  | { status: "reading"; file: File }
  | { status: "uploading"; prepared: PreparedFile; percent: number }
  | { status: "finishing"; prepared: PreparedFile }
  | { status: "failed"; prepared: PreparedFile }
  // A collaborator's file the owner's storage can't take; retrying can't help.
  | { status: "refused"; prepared: PreparedFile }

// The article follows how the first format is spoken: an MP3/AAC/M4A, a WAV/FLAC.
const VOWEL_SOUND = new Set<AudioFormat>(["mp3", "aac", "m4a"])
const aFormat = (formats: readonly AudioFormat[]) =>
  `${formats[0] && VOWEL_SOUND.has(formats[0]) ? "an" : "a"} ${formatList(formats)}`

export const uploadMessages = {
  format: (formats: readonly AudioFormat[]) => `Use ${aFormat(formats)} file`,
  // An audio format the plan doesn't take, e.g. a WAV bounce on the free plan.
  otherFormat: (formats: readonly AudioFormat[]) =>
    `Upload ${aFormat(formats)} file. Export your mix as a 320 kbps MP3 to upload it.`,
  size: (maxFileBytes: number) =>
    `Files can be up to ${formatBytes(maxFileBytes)}`,
  unreadable: "This file couldn't be read as audio",
  tooLong: "Tracks can be up to 6 hours long",
  // Without a known amount (no usage yet), the sentence drops it.
  noSpace: (leftBytes?: number) =>
    leftBytes === undefined
      ? "Not enough space. Delete a version to free some up."
      : `Not enough space: ${formatBytes(leftBytes)} left. Delete a version to free some up.`,
  storageFull: (limitBytes: number) =>
    `Free plan: ${formatBytes(limitBytes)} used. Delete a version to upload another.`,
  projectFull: "This project can't accept more uploads.",
  refused: "This project can't accept this file.",
}

type Options = {
  // Omitted for a first upload, which creates the project.
  projectId?: string
  // The owner's plan rules; the server checks them again when the upload is registered.
  maxFileBytes: number
  acceptedFormats: readonly AudioFormat[]
  // Checked before any request when known (project page); the server enforces it either way.
  spaceLeftBytes?: number
  onProjectNotFound?: () => void
  // Uploading into someone else's project: their storage, whose numbers this user never sees.
  collaborator?: boolean
}

type Run = { controller: AbortController }

function formatError(
  fileName: string,
  formats: readonly AudioFormat[],
): string | null {
  if (!isAudioFileName(fileName)) return uploadMessages.format(formats)
  return formats.includes(fileExtension(fileName) as AudioFormat)
    ? null
    : uploadMessages.otherFormat(formats)
}

const errorOf = (err: unknown) => ({
  status: httpStatus(err),
  code: apiErrorCode(err),
})

function putFile(
  target: CreateUploadResponse,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(target.method, target.uploadUrl)
    for (const [name, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.floor((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`storage answered ${xhr.status}`))
    xhr.onerror = () => reject(new Error("storage unreachable"))
    xhr.onabort = () => reject(new Error("aborted"))
    signal.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The whole upload flow: check and decode the file, register it, PUT it to storage with
// progress, then turn it into a track and open it.
export function useUpload({
  projectId,
  maxFileBytes,
  acceptedFormats,
  spaceLeftBytes,
  onProjectNotFound,
  collaborator = false,
}: Options) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [state, setState] = useState<UploadState>({
    status: "idle",
    error: null,
  })
  // Only the current run may update state; a cancelled one finishes silently.
  const run = useRef<Run | null>(null)
  // The server keeps one pending upload per user; delete it when the user gives up on it.
  const pendingUploadId = useRef<string | null>(null)
  const mounted = useRef(false)

  const discardPending = useCallback(() => {
    const id = pendingUploadId.current
    pendingUploadId.current = null
    if (id) api.delete(`/uploads/${id}`).catch(() => {})
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (!run.current) return
      run.current.controller.abort()
      run.current = null
      discardPending()
    }
  }, [discardPending])

  const upload = useCallback(
    async (prepared: PreparedFile) => {
      run.current?.controller.abort()
      const current: Run = { controller: new AbortController() }
      run.current = current
      const live = () => run.current === current
      const { signal } = current.controller
      let step: "register" | "put" | "complete" = "register"
      setState({ status: "uploading", prepared, percent: 0 })

      try {
        const body: CreateUploadBody = {
          fileName: prepared.file.name,
          sizeBytes: prepared.file.size,
          ...(projectId ? { projectId } : {}),
        }
        const { data } = await api.post("/uploads", body, { signal })
        const target = createUploadResponseSchema.parse(data)
        // A superseded run's upload was already replaced on the server; don't track its id.
        if (!live()) return
        pendingUploadId.current = target.uploadId

        step = "put"
        await putFile(
          target,
          prepared.file,
          (percent) => {
            if (live()) setState({ status: "uploading", prepared, percent })
          },
          signal,
        )
        if (!live()) return

        step = "complete"
        setState({ status: "finishing", prepared })
        const completeBody: CompleteUploadBody = {
          durationMs: prepared.durationMs,
          peaks: prepared.peaks,
        }
        const complete = () =>
          api.post(`/uploads/${target.uploadId}/complete`, completeBody, {
            signal,
          })
        let response: Awaited<ReturnType<typeof complete>>
        try {
          response = await complete()
        } catch (err) {
          // Storage can take a moment to show the object; one retry, then give up.
          if (errorOf(err).code !== "upload_incomplete") throw err
          await sleep(1000)
          if (!live()) return
          response = await complete()
        }
        const result = completeUploadResponseSchema.parse(response.data)
        pendingUploadId.current = null
        if (!live()) return
        run.current = null

        await Promise.all([
          qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY }),
          qc.invalidateQueries({ queryKey: USAGE_QUERY_KEY }),
        ])
        await navigate({
          to: "/app/projects/$projectId/tracks/$trackId",
          params: { projectId: result.projectId, trackId: result.track.id },
        })
      } catch (err) {
        if (!live()) return
        run.current = null
        const { status, code } = errorOf(err)
        if (code === "project_limit_reached") {
          pendingUploadId.current = null
          // The cached list may still be empty, which would route straight back here.
          // Nothing on this page observes it, so the refetch has to be forced.
          await qc.invalidateQueries({
            queryKey: PROJECTS_QUERY_KEY,
            refetchType: "all",
          })
          await navigate({ to: "/app/projects" })
          return
        }
        if (code === "storage_limit_reached") {
          pendingUploadId.current = null
          if (collaborator) {
            // Refreshes `acceptsUploads`, which may now disable the dropzone.
            void qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
            setState({ status: "refused", prepared })
            return
          }
          // The cached amount passed the client check, so it is stale; refetch and leave it out.
          void qc.invalidateQueries({ queryKey: USAGE_QUERY_KEY })
          setState({ status: "idle", error: uploadMessages.noSpace() })
          return
        }
        if (step === "register" && code === "validation_failed") {
          setState({
            status: "idle",
            error: isAudioFileName(prepared.file.name)
              ? uploadMessages.size(maxFileBytes)
              : uploadMessages.format(acceptedFormats),
          })
          return
        }
        // The cached plan passed the client check, so it is stale; the message is about the file.
        if (code === "format_not_allowed" || code === "file_too_large") {
          void qc.invalidateQueries({ queryKey: USAGE_QUERY_KEY })
          if (projectId) {
            void qc.invalidateQueries({ queryKey: projectKey(projectId) })
          }
          setState({
            status: "idle",
            error:
              code === "file_too_large"
                ? uploadMessages.size(maxFileBytes)
                : (formatError(prepared.file.name, acceptedFormats) ??
                  uploadMessages.otherFormat(acceptedFormats)),
          })
          return
        }
        if (step === "register" && status === 404 && onProjectNotFound) {
          onProjectNotFound()
          return
        }
        setState({ status: "failed", prepared })
      }
    },
    [
      projectId,
      maxFileBytes,
      acceptedFormats,
      onProjectNotFound,
      collaborator,
      qc,
      navigate,
    ],
  )

  const choose = useCallback(
    async (file: File) => {
      if (state.status !== "idle") return
      let error = formatError(file.name, acceptedFormats)
      if (!error && file.size > maxFileBytes)
        error = uploadMessages.size(maxFileBytes)
      else if (
        !error &&
        spaceLeftBytes !== undefined &&
        file.size > spaceLeftBytes
      )
        error = uploadMessages.noSpace(spaceLeftBytes)
      if (error) {
        setState({ status: "idle", error })
        return
      }

      setState({ status: "reading", file })
      let decoded: Awaited<ReturnType<typeof decodeAudio>>
      try {
        decoded = await decodeAudio(file)
      } catch {
        if (mounted.current)
          setState({ status: "idle", error: uploadMessages.unreadable })
        return
      }
      if (!mounted.current) return
      if (decoded.durationMs > MAX_DURATION_MS) {
        setState({ status: "idle", error: uploadMessages.tooLong })
        return
      }
      await upload({ file, ...decoded })
    },
    [state.status, maxFileBytes, acceptedFormats, spaceLeftBytes, upload],
  )

  const cancel = useCallback(() => {
    if (state.status !== "uploading") return
    run.current?.controller.abort()
    run.current = null
    discardPending()
    setState({ status: "idle", error: null })
  }, [state.status, discardPending])

  // A new registration replaces the pending upload, so the old id needs no delete.
  const retry = useCallback(() => {
    if (state.status === "failed") void upload(state.prepared)
  }, [state, upload])

  const chooseAnother = useCallback(() => {
    discardPending()
    setState({ status: "idle", error: null })
  }, [discardPending])

  return { state, choose, cancel, retry, chooseAnother }
}
