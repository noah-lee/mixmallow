import {
  audioUrlResponseSchema,
  type CreateNoteBody,
  type Note,
  noteListResponseSchema,
  noteSchema,
  type TrackDetail,
  trackDetailSchema,
  type UpdateNoteBody,
} from "@repo/shared/schemas"
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api, fetchJson, retryUnlessClientError } from "@/lib/api"

const trackKey = (trackId: string) => ["tracks", trackId] as const
const notesKey = (trackId: string) => [...trackKey(trackId), "notes"] as const

export const trackQueryOptions = (trackId: string) =>
  queryOptions({
    queryKey: trackKey(trackId),
    queryFn: () => fetchJson(`/tracks/${trackId}`, trackDetailSchema),
    retry: retryUnlessClientError,
  })

// Signed and short-lived: the player refetches it when the media element fails, never on a timer,
// so a playing source isn't swapped out underneath the listener.
export const audioUrlQueryOptions = (trackId: string) =>
  queryOptions({
    queryKey: [...trackKey(trackId), "audio"],
    queryFn: () =>
      fetchJson(`/tracks/${trackId}/audio`, audioUrlResponseSchema),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: retryUnlessClientError,
  })

export const notesQueryOptions = (trackId: string) =>
  queryOptions({
    queryKey: notesKey(trackId),
    queryFn: async () =>
      (await fetchJson(`/tracks/${trackId}/notes`, noteListResponseSchema))
        .items,
    retry: retryUnlessClientError,
  })

export function forgetTrack(
  qc: ReturnType<typeof useQueryClient>,
  trackId: string,
) {
  qc.removeQueries({ queryKey: trackKey(trackId) })
}

export function setTrackName(
  qc: ReturnType<typeof useQueryClient>,
  trackId: string,
  name: string,
) {
  qc.setQueryData<TrackDetail>(trackKey(trackId), (track) =>
    track ? { ...track, name } : track,
  )
}

// The server's order: time, then creation.
function byTime(a: Note, b: Note): number {
  return (
    a.timestampMs - b.timestampMs ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  )
}

function useSetNotes(trackId: string) {
  const qc = useQueryClient()
  return (update: (notes: Note[]) => Note[]) =>
    qc.setQueryData<Note[]>(notesKey(trackId), (notes) =>
      notes ? update(notes).sort(byTime) : notes,
    )
}

export function useCreateNote(trackId: string) {
  const setNotes = useSetNotes(trackId)
  return useMutation({
    mutationFn: async (body: CreateNoteBody) => {
      const { data } = await api.post(`/tracks/${trackId}/notes`, body)
      return noteSchema.parse(data)
    },
    onSuccess: (note) => setNotes((notes) => [...notes, note]),
  })
}

export function useUpdateNote(trackId: string) {
  const setNotes = useSetNotes(trackId)
  return useMutation({
    mutationFn: async ({
      noteId,
      ...body
    }: UpdateNoteBody & { noteId: string }) => {
      const { data } = await api.patch(`/notes/${noteId}`, body)
      return noteSchema.parse(data)
    },
    onSuccess: (note) =>
      setNotes((notes) => notes.map((n) => (n.id === note.id ? note : n))),
  })
}

export function useDeleteNote() {
  return useMutation({
    mutationFn: (noteId: string) => api.delete(`/notes/${noteId}`),
  })
}

// Optimistic edits to the cached list, for done toggles and deletes. Each cancels in-flight
// fetches first, or one landing late overwrites the edit (a cancel reverts asynchronously).
export function useNoteCache(trackId: string) {
  const qc = useQueryClient()
  const setNotes = useSetNotes(trackId)
  const cancel = () => qc.cancelQueries({ queryKey: notesKey(trackId) })
  return {
    put: async (note: Note) => {
      await cancel()
      setNotes((notes) => [...notes.filter((n) => n.id !== note.id), note])
    },
    remove: async (noteId: string) => {
      await cancel()
      setNotes((notes) => notes.filter((n) => n.id !== noteId))
    },
    refetch: () => qc.invalidateQueries({ queryKey: notesKey(trackId) }),
  }
}
