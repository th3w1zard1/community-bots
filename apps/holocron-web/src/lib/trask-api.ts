/**
 * Calls a host that mounts `createTraskHttpRouter` at `/api/trask`
 * (standalone `@openkotor/trask-http-server` or Trask bot embedded Holocron).
 */

export interface TraskSourceDto {
  id: string
  name: string
  kind: string
  homeUrl: string
  description: string
  freshnessPolicy: string
}

export interface TraskHistoryLiveEventDto {
  at: string
  phase: string
  detail?: string
  sources?: Array<{ id: string; name: string; url: string }>
}

export interface TraskHistoryRecordDto {
  queryId: string
  threadId?: string
  userId: string
  query: string
  status: 'pending' | 'complete' | 'failed'
  answer: string | null
  sources: Array<{ id: string; name: string; url: string }>
  error: string | null
  createdAt: string
  completedAt: string | null
  /** Progress timeline while pending (and retained after completion for replay/debug). */
  liveTrace?: TraskHistoryLiveEventDto[]
}

export interface TraskSessionDto {
  loggedIn: boolean
  oauthAvailable?: boolean
  discord?: { id: string; username: string; displayName: string }
}

function apiBase(): string {
  return import.meta.env.VITE_TRASK_API_BASE?.replace(/\/+$/, '') ?? ''
}

function authHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const key =
    apiKey?.trim() ||
    (typeof import.meta.env.VITE_TRASK_API_KEY === 'string' ? import.meta.env.VITE_TRASK_API_KEY.trim() : '')
  if (key) {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

function traskRequestInit(apiKey?: string, init?: RequestInit): RequestInit {
  const sameOrigin = !apiBase()
  const baseHeaders = authHeaders(apiKey)
  const extra =
    init?.headers && typeof init.headers === 'object' && !Array.isArray(init.headers)
      ? (init.headers as Record<string, string>)
      : {}
  return {
    ...init,
    credentials: sameOrigin ? 'include' : 'omit',
    headers: { ...baseHeaders, ...extra },
  }
}

export function traskUsesSameOriginApi(): boolean {
  return !apiBase()
}

export async function traskFetchSession(): Promise<TraskSessionDto | null> {
  try {
    const res = await fetch(`${apiBase()}/api/trask/session`, traskRequestInit())
    if (!res.ok) {
      return null
    }
    return (await res.json()) as TraskSessionDto
  } catch {
    return null
  }
}

export async function traskLogout(): Promise<void> {
  await fetch(`${apiBase()}/api/trask/auth/logout`, traskRequestInit(undefined, { method: 'POST' }))
}

/** Public capability URL: persisted threads only (e.g. opened from Discord). */
export async function traskGetThread(threadId: string): Promise<TraskHistoryRecordDto[]> {
  const res = await fetch(
    `${apiBase()}/api/trask/thread/${encodeURIComponent(threadId)}`,
    traskRequestInit(undefined, { method: 'GET' }),
  )
  const data = (await res.json()) as { history?: TraskHistoryRecordDto[]; error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `thread failed: ${res.status}`)
  }
  return data.history ?? []
}

export async function traskListSources(apiKey?: string): Promise<TraskSourceDto[]> {
  const res = await fetch(`${apiBase()}/api/trask/sources`, traskRequestInit(apiKey))
  const data = (await res.json()) as { sources?: TraskSourceDto[]; error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `sources failed: ${res.status}`)
  }
  return data.sources ?? []
}

export async function traskListHistory(
  limit: number,
  apiKey?: string,
  threadId?: string,
): Promise<TraskHistoryRecordDto[]> {
  const q = new URLSearchParams({ limit: String(limit) })
  if (threadId?.trim()) {
    q.set('thread', threadId.trim())
  }
  const res = await fetch(`${apiBase()}/api/trask/history?${q}`, traskRequestInit(apiKey))
  const data = (await res.json()) as { history?: TraskHistoryRecordDto[]; error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `history failed: ${res.status}`)
  }
  return data.history ?? []
}

/**
 * Starts a Trask retrieval. When the server persists queries (logged-in / API-key sessions),
 * responds with **202** and `pending`; poll `traskGetThread(threadId)` until `complete` | `failed`.
 * Anonymous non-persist mode returns **201** with a finished record in one shot.
 */
export async function traskAsk(
  query: string,
  apiKey?: string,
  threadId?: string,
): Promise<TraskHistoryRecordDto> {
  const body: { query: string; threadId?: string } = { query }
  if (threadId?.trim()) {
    body.threadId = threadId.trim()
  }
  const res = await fetch(`${apiBase()}/api/trask/ask`, traskRequestInit(apiKey, {
    method: 'POST',
    body: JSON.stringify(body),
  }))
  const data = (await res.json()) as {
    error?: string
    query?: TraskHistoryRecordDto
  }
  const record = data.query
  if (!record) {
    throw new Error(data.error ?? `ask failed: ${res.status}`)
  }
  if (!res.ok && res.status !== 202) {
    throw new Error(data.error ?? record.error ?? `ask failed: ${res.status}`)
  }
  if (record.status === 'failed') {
    throw new Error(record.error ?? 'Trask research failed.')
  }
  return record
}
