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
