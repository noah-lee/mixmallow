import axios, { type AxiosRequestConfig } from "axios"
import type { z } from "zod"

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
})

let refreshPromise: Promise<void> | null = null

function refresh(): Promise<void> {
  refreshPromise ??= (async () => {
    try {
      await api.post("/auth/refresh")
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error)
    const original = error.config as
      | (AxiosRequestConfig & { _retry?: boolean })
      | undefined
    const status = error.response?.status
    if (
      status !== 401 ||
      !original ||
      original.url === "/auth/refresh" ||
      original._retry
    ) {
      return Promise.reject(error)
    }
    original._retry = true
    try {
      await refresh()
    } catch {
      return Promise.reject(error)
    }
    return api(original)
  },
)

export async function fetchJson<S extends z.ZodType>(
  url: string,
  schema: S,
  config?: AxiosRequestConfig,
): Promise<z.infer<S>> {
  const { data } = await api.get(url, config)
  return schema.parse(data)
}

export function httpStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined
}

export function apiErrorCode(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined
  const data: unknown = err.response?.data
  return data && typeof data === "object" && "error" in data
    ? String(data.error)
    : undefined
}

// A 4xx won't change on retry, and a not-found state shouldn't wait out the backoff.
export function retryUnlessClientError(
  failureCount: number,
  err: unknown,
): boolean {
  const status = httpStatus(err)
  if (status !== undefined && status >= 400 && status < 500) return false
  return failureCount < 2
}

// The `path` of each field a `400 validation_failed` names ("/text", "/timestampMs").
export function validationPaths(err: unknown): string[] {
  if (!axios.isAxiosError(err)) return []
  const data: unknown = err.response?.data
  if (!data || typeof data !== "object" || !("details" in data)) return []
  const { details } = data
  if (!Array.isArray(details)) return []
  return details.flatMap((d: unknown) =>
    d && typeof d === "object" && "path" in d && typeof d.path === "string"
      ? [d.path]
      : [],
  )
}
