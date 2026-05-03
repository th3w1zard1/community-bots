import { useState, useRef, useEffect, useCallback } from 'react'
import { useKV } from '@github/spark/hooks'
import { Message as MessageType, AgentResult, SourceWeight, DEFAULT_SOURCE_WEIGHTS, Conversation, isMessageArray } from '@/lib/types'
import { Message } from '@/components/Message'
import { AgentPanel } from '@/components/AgentPanel'
import { ConversationSidebar } from '@/components/ConversationSidebar'
import { SourceWeightsDialog } from '@/components/SourceWeightsDialog'
import { KeyboardShortcutsDialog } from '@/components/KeyboardShortcutsDialog'
import { PromptsDialog } from '@/components/PromptsDialog'
import { TopNav, type HolocronSessionUi } from '@/components/TopNav'
import { HolocronGlyph } from '@/components/HolocronGlyph'
import {
  HolocronSanctum,
  type HolocronFluxEvent,
  type HolocronRetrievalPulse,
  type HolocronSourceZone,
  shardZoneForToken,
  zoneFromQueryKeyTerms,
  zoneFromSourceLabel,
} from '@/components/HolocronSanctum'
import { fluxTokensFromQuery, holocronQuerySignature } from '@/lib/holocron-live'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toaster } from '@/components/ui/sonner'
import { ArrowRight, Sliders, Keyboard, Code } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { usePrompts } from '@/lib/prompts'
import {
  detectQuestionRelevance,
  performMultiAgentRetrieval,
  aggregateAnswer,
  checkIfRepeatQuestion,
  classifyQueryType,
} from '@/lib/qa-engine'
import {
  traskAsk,
  traskFetchSession,
  traskGetThread,
  traskListHistory,
  traskLogout,
  traskUsesSameOriginApi,
  type TraskHistoryLiveEventDto,
  type TraskHistoryRecordDto,
  type TraskSessionDto,
} from '@/lib/trask-api'

const legacySparkMode = import.meta.env.VITE_TRASK_LEGACY_SPARK === '1'

const HOL_THREAD_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function isHolocronThreadId(value: string): boolean {
  return HOL_THREAD_RE.test(value.trim())
}

function holocronConversationId(threadId: string): string {
  return `holocron-${threadId}`
}

function traceDedupeStorageKey(threadId: string): string {
  return `holocron-trace-seen-${threadId}`
}

function loadSeenTraceKeys(threadId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(traceDedupeStorageKey(threadId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function saveSeenTraceKeys(threadId: string, seen: Set<string>): void {
  try {
    const arr = [...seen]
    const tail = arr.slice(-600)
    sessionStorage.setItem(traceDedupeStorageKey(threadId), JSON.stringify(tail))
  } catch {
    /* ignore */
  }
}

function pulseWordsFromTrace(ev: TraskHistoryLiveEventDto, rec: TraskHistoryRecordDto): string {
  const raw = (ev.detail ?? ev.phase ?? '').trim()
  if (raw) return shortFluxWords(raw, 4)
  return shortFluxWords(rec.query, 2)
}

function mergeHolocronThreadMessages(local: MessageType[], records: TraskHistoryRecordDto[]): MessageType[] {
  const serverMsgs = mapTraskHistoryToMessages(records)
  const extraLocals = local.filter((m) => {
    if (m.role !== 'user') return false
    const key = m.content.trim().toLowerCase()
    return !records.some((r) => r.query.trim().toLowerCase() === key)
  })
  return [...serverMsgs, ...extraLocals].sort((a, b) => a.timestamp - b.timestamp)
}

function mapTraskHistoryToMessages(records: TraskHistoryRecordDto[]): MessageType[] {
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const syncedMessages: MessageType[] = []
  for (const rec of sorted) {
    syncedMessages.push({
      id: `srv-${rec.queryId}-u`,
      role: 'user',
      content: rec.query,
      timestamp: Date.parse(rec.createdAt) || Date.now(),
    })
    if (rec.status === 'complete' && rec.answer) {
      const mappedSources = (rec.sources ?? []).map((s) => ({
        name: s.name,
        url: s.url,
        confidence: 1,
      }))
      syncedMessages.push({
        id: `srv-${rec.queryId}-a`,
        role: 'assistant',
        content: rec.answer,
        expandedContent: rec.answer,
        sources: mappedSources,
        timestamp: Date.parse(rec.completedAt ?? rec.createdAt) || Date.now(),
        isExpanded: false,
        agentResults: [
          {
            agentName: 'Trask',
            source: 'holocron',
            snippet: rec.answer.slice(0, 280),
            confidence: 1,
            status: 'complete',
            retrievedContent: rec.answer,
          },
        ],
        queryType: 'general',
      })
    } else if (rec.status === 'failed') {
      syncedMessages.push({
        id: `srv-${rec.queryId}-e`,
        role: 'system',
        content: rec.error ?? 'Research failed.',
        timestamp: Date.parse(rec.completedAt ?? rec.createdAt) || Date.now(),
      })
    }
  }
  return syncedMessages
}

function shortFluxWords(text: string, cap = 3): string {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter(Boolean)
    .slice(0, cap)
    .join(' ')
}

function scheduleQueryFluxShards(query: string, append: (words: string, zone: HolocronSourceZone) => void): void {
  const trimmed = query.trim()
  const tokens = fluxTokensFromQuery(trimmed)
  if (tokens.length === 0) {
    append(shortFluxWords(trimmed), zoneFromQueryKeyTerms(trimmed))
    return
  }
  const base = zoneFromQueryKeyTerms(trimmed)
  tokens.forEach((tok, i) => {
    window.setTimeout(() => {
      append(tok, i === 0 ? base : shardZoneForToken(trimmed, tok, i))
    }, i * 110)
  })
}

/** Outbound glyphs: token stream from the answer, striped across zones that actually fired. */
function scheduleAnswerFluxShards(
  answer: string,
  zones: HolocronSourceZone[],
  append: (words: string, zone: HolocronSourceZone) => void,
): void {
  if (zones.length === 0) return
  const trimmed = answer.trim()
  const tokens = fluxTokensFromQuery(trimmed, 10)
  if (tokens.length === 0) {
    const fallback = shortFluxWords(trimmed, 4)
    zones.forEach((z, i) => {
      window.setTimeout(() => append(fallback, z), i * 80)
    })
    return
  }
  tokens.forEach((tok, i) => {
    const zone = zones[i % zones.length]!
    window.setTimeout(() => append(tok, zone), i * 95)
  })
}

function App() {
  const [conversations, setConversations] = useKV<Conversation[]>('qa-conversations', [])
  const [activeConversationId, setActiveConversationId] = useKV<string | null>('active-conversation-id', null)
  const [sourceWeights, setSourceWeights] = useKV<SourceWeight[]>('source-weights', DEFAULT_SOURCE_WEIGHTS)
  const [traskApiKey, setTraskApiKey] = useKV<string>('qa-trask-web-api-key', '')
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeAgents, setActiveAgents] = useState<AgentResult[]>([])
  const [currentQueryType, setCurrentQueryType] = useState<'modding' | 'technical' | 'lore' | 'general'>('general')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [isPromptsOpen, setIsPromptsOpen] = useState(false)
  const [holocronSession, setHolocronSession] = useState<HolocronSessionUi>(() =>
    !legacySparkMode && traskUsesSameOriginApi() ? { status: 'loading' } : { status: 'anonymous', oauthAvailable: false },
  )
  const [holocronThreadId, setHolocronThreadId] = useState('')
  const [queryFlux, setQueryFlux] = useState<HolocronFluxEvent[]>([])
  const [answerFlux, setAnswerFlux] = useState<HolocronFluxEvent[]>([])
  const [sourceMetrics, setSourceMetrics] = useState<Record<HolocronSourceZone, number>>({
    deadlystream: 0,
    lucasforums: 0,
    kotor: 0,
    modding: 0,
    core: 0,
  })
  const [holocronInteractionCount, setHolocronInteractionCount] = useState(0)
  const [holocronAnswerBondTicks, setHolocronAnswerBondTicks] = useState(0)
  const [holocronLiveQuery, setHolocronLiveQuery] = useState('')
  const [livePulses, setLivePulses] = useState<HolocronRetrievalPulse[]>([])
  const traceSeenRef = useRef<Set<string>>(new Set())
  const { prompts } = usePrompts()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const activeConversation = (conversations || []).find(c => c.id === activeConversationId)
  const messages = activeConversation?.messages || []

  const syncThreadFromRemote = useCallback(
    (
      records: TraskHistoryRecordDto[],
      opts?: { animateTrace?: boolean; prependLocals?: MessageType[] },
    ) => {
      if (!holocronThreadId) return
      const animateTrace = opts?.animateTrace ?? true
      const prependLocals = opts?.prependLocals ?? []
      if (!legacySparkMode && traskUsesSameOriginApi() && animateTrace) {
        const seen = traceSeenRef.current
        const pulses: HolocronRetrievalPulse[] = []
        const zonesRank = new Map<HolocronSourceZone, number>()
        for (const rec of records) {
          const trace = rec.liveTrace ?? []
          for (let i = 0; i < trace.length; i++) {
            const ev = trace[i]!
            const dedupeKey = `${rec.queryId}:${ev.at}:${ev.phase}:${ev.detail ?? ''}:${i}`
            if (seen.has(dedupeKey)) continue
            seen.add(dedupeKey)
            if (!animateTrace) continue
            const phase = (ev.phase ?? '').toLowerCase()
            const dir: 'in' | 'out' =
              phase === 'sources' || phase === 'compose' ? 'out' : 'in'
            let zone: HolocronSourceZone = 'core'
            if (dir === 'out' && ev.sources?.length) {
              const targets = ev.sources.map((s) => zoneFromSourceLabel(`${s.name} ${s.url}`))
              zone = targets[i % targets.length]!
              for (const z of targets) {
                zonesRank.set(z, (zonesRank.get(z) ?? 0) + 1)
              }
            } else if (dir === 'in' && ev.sources?.length) {
              const targets = ev.sources.map((s) => zoneFromSourceLabel(`${s.name} ${s.url}`))
              zone = targets[0]!
              for (const z of targets) {
                zonesRank.set(z, (zonesRank.get(z) ?? 0) + 1)
              }
            } else {
              zone =
                phase === 'gather'
                  ? zoneFromQueryKeyTerms(rec.query)
                  : shardZoneForToken(rec.query, `${phase}:${ev.detail ?? ''}`, i)
            }
            pulses.push({
              id: `srv-pulse-${dedupeKey}`,
              words: pulseWordsFromTrace(ev, rec),
              zone,
              direction: dir,
              createdAt: Date.now(),
            })
          }
        }
        if (pulses.length) {
          setLivePulses((cur) => [...cur.slice(-48), ...pulses])
          for (const [zone, n] of zonesRank) {
            setSourceMetrics((c) => ({ ...c, [zone]: (c[zone] ?? 0) + n }))
          }
          setHolocronInteractionCount((n) => n + pulses.length)
        }
        saveSeenTraceKeys(holocronThreadId, seen)
      }

      const convId = holocronConversationId(holocronThreadId)
      setConversations((current) => {
        const list = current || []
        const others = list.filter((c) => c.id !== convId)
        const prev = list.find((c) => c.id === convId)
        const localBase = [...prependLocals, ...(prev?.messages ?? [])]
        const merged = mergeHolocronThreadMessages(localBase, records)
        const firstUser = merged.find((m) => m.role === 'user')
        const title =
          firstUser?.content.substring(0, 50) + (firstUser && firstUser.content.length > 50 ? '...' : '') ||
          'Trask · Holocron'
        const conv: Conversation = {
          id: convId,
          title,
          messages: merged,
          createdAt: prev?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        }
        return [conv, ...others]
      })
      setActiveConversationId(convId)
    },
    [holocronThreadId, legacySparkMode],
  )

  useEffect(() => {
    if (legacySparkMode || !traskUsesSameOriginApi() || !holocronThreadId) {
      traceSeenRef.current = new Set()
      return
    }
    traceSeenRef.current = loadSeenTraceKeys(holocronThreadId)
    let cancelled = false
    const tick = async () => {
      try {
        const remote = await traskGetThread(holocronThreadId)
        if (cancelled) return
        syncThreadFromRemote(remote, { animateTrace: true })
      } catch {
        /* ignore transient errors */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 900)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [holocronThreadId, legacySparkMode, syncThreadFromRemote])

  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - 2800
      setLivePulses((cur) => cur.filter((p) => p.createdAt > cutoff))
    }, 400)
    return () => window.clearInterval(id)
  }, [])

  const handleCreateConversation = () => {
    if (!legacySparkMode && traskUsesSameOriginApi()) {
      const tid = crypto.randomUUID()
      const params = new URLSearchParams(window.location.search)
      params.set('thread', tid)
      const qs = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
      setHolocronThreadId(tid)
      traceSeenRef.current = new Set()
      setLivePulses([])
      const convId = holocronConversationId(tid)
      const newConversation: Conversation = {
        id: convId,
        title: 'New Holocron thread',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setConversations((current) => {
        const list = current || []
        const others = list.filter((c) => !c.id.startsWith('holocron-'))
        return [...others, newConversation]
      })
      setActiveConversationId(convId)
      try {
        sessionStorage.removeItem(`holocron-ephemeral-${tid}`)
      } catch {
        /* ignore */
      }
      return
    }

    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    setConversations((current) => [...(current || []), newConversation])
    setActiveConversationId(newConversation.id)
  }

  useKeyboardShortcuts([
    {
      key: 'n',
      ctrlKey: true,
      handler: handleCreateConversation,
      description: 'New conversation',
    },
    {
      key: 'n',
      metaKey: true,
      handler: handleCreateConversation,
      description: 'New conversation',
    },
    {
      key: 'k',
      ctrlKey: true,
      handler: () => searchInputRef.current?.focus(),
      description: 'Focus search',
    },
    {
      key: 'k',
      metaKey: true,
      handler: () => searchInputRef.current?.focus(),
      description: 'Focus search',
    },
    {
      key: '/',
      ctrlKey: true,
      handler: () => setIsShortcutsOpen(true),
      description: 'Show shortcuts',
    },
    {
      key: '/',
      metaKey: true,
      handler: () => setIsShortcutsOpen(true),
      description: 'Show shortcuts',
    },
    {
      key: 'p',
      ctrlKey: true,
      shiftKey: true,
      handler: () => setIsPromptsOpen(true),
      description: 'Edit AI prompts',
    },
    {
      key: 'p',
      metaKey: true,
      shiftKey: true,
      handler: () => setIsPromptsOpen(true),
      description: 'Edit AI prompts',
    },
  ], !isSettingsOpen && !isShortcutsOpen && !isPromptsOpen)

  useEffect(() => {
    if (!legacySparkMode && traskUsesSameOriginApi()) {
      return
    }
    if (!activeConversationId && (conversations || []).length === 0) {
      handleCreateConversation()
    }
  }, [])

  useEffect(() => {
    if (legacySparkMode || !traskUsesSameOriginApi()) {
      return
    }
    const params = new URLSearchParams(window.location.search)
    let tid = params.get('thread')?.trim() ?? ''
    if (!isHolocronThreadId(tid)) {
      tid = crypto.randomUUID()
      params.set('thread', tid)
      const qs = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    }
    setHolocronThreadId(tid)
  }, [legacySparkMode])

  /** Holocron: create shell + select thread immediately so the composer is never blocked on session/history fetch. */
  useEffect(() => {
    if (legacySparkMode || !traskUsesSameOriginApi() || !holocronThreadId) {
      return
    }
    const convId = holocronConversationId(holocronThreadId)
    setConversations((current) => {
      const list = current || []
      if (list.some((c) => c.id === convId)) {
        return list
      }
      const shell: Conversation = {
        id: convId,
        title: 'New Holocron thread',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      return [shell, ...list.filter((c) => c.id !== convId)]
    })
    setActiveConversationId(convId)
  }, [holocronThreadId, legacySparkMode])

  useEffect(() => {
    if (legacySparkMode || !traskUsesSameOriginApi() || !holocronThreadId) {
      return
    }

    let cancelled = false
    const convId = holocronConversationId(holocronThreadId)
    const ephemeralKey = `holocron-ephemeral-${holocronThreadId}`

    void (async () => {
      const session = await traskFetchSession()
      if (cancelled) return

      const loadEphemeralPrepend = (): MessageType[] => {
        try {
          const raw = sessionStorage.getItem(ephemeralKey)
          if (!raw) return []
          const parsed: unknown = JSON.parse(raw)
          return isMessageArray(parsed) ? parsed : []
        } catch {
          return []
        }
      }

      if (!session) {
        setHolocronSession({ status: 'anonymous', oauthAvailable: false })
        try {
          const remote = await traskGetThread(holocronThreadId)
          if (cancelled) return
          syncThreadFromRemote(remote, { animateTrace: false, prependLocals: loadEphemeralPrepend() })
        } catch {
          if (!cancelled) {
            syncThreadFromRemote([], { animateTrace: false, prependLocals: loadEphemeralPrepend() })
          }
        }
        return
      }

      if (!session.loggedIn || !session.discord) {
        setHolocronSession({
          status: 'anonymous',
          oauthAvailable: Boolean(session.oauthAvailable),
        })
        try {
          const remote = await traskGetThread(holocronThreadId)
          if (cancelled) return
          syncThreadFromRemote(remote, { animateTrace: false, prependLocals: loadEphemeralPrepend() })
        } catch {
          if (!cancelled) {
            syncThreadFromRemote([], { animateTrace: false, prependLocals: loadEphemeralPrepend() })
          }
        }
        return
      }

      try {
        const history = await traskListHistory(100, undefined, holocronThreadId)
        if (cancelled) return
        syncThreadFromRemote(history, { animateTrace: false })
      } catch {
        if (!cancelled) {
          toast.error('Could not load Trask history from the server.')
        }
      }

      if (!cancelled) {
        setHolocronSession({
          status: 'loggedIn',
          discord: {
            username: session.discord.username,
            displayName: session.discord.displayName || session.discord.username,
          },
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [holocronThreadId, legacySparkMode, syncThreadFromRemote])

  useEffect(() => {
    if (legacySparkMode || !traskUsesSameOriginApi() || !holocronThreadId) {
      return
    }
    if (holocronSession.status !== 'anonymous') {
      return
    }
    const convId = holocronConversationId(holocronThreadId)
    const conv = (conversations || []).find((c) => c.id === convId)
    if (!conv) {
      return
    }
    try {
      sessionStorage.setItem(`holocron-ephemeral-${holocronThreadId}`, JSON.stringify(conv.messages))
    } catch {
      /* ignore */
    }
  }, [conversations, holocronSession.status, holocronThreadId, legacySparkMode])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, activeAgents])

  useEffect(() => {
    const id = window.setTimeout(() => setHolocronLiveQuery(input.trim()), 120)
    return () => window.clearTimeout(id)
  }, [input])

  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - 3400
      setQueryFlux((current) => current.filter((e) => e.createdAt > cutoff))
      setAnswerFlux((current) => current.filter((e) => e.createdAt > cutoff))
    }, 640)
    return () => window.clearInterval(id)
  }, [])

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id)
  }

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((current) =>
      (current || []).map((conv) =>
        conv.id === id ? { ...conv, title: newTitle } : conv
      )
    )
  }

  const handleDeleteConversation = (id: string) => {
    setConversations((current) => (current || []).filter((conv) => conv.id !== id))
    if (activeConversationId === id) {
      const remaining = (conversations || []).filter((conv) => conv.id !== id)
      setActiveConversationId(remaining.length > 0 ? remaining[0].id : null)
    }
  }

  const handleImportConversations = (importedConversations: Conversation[], importedSourceWeights?: SourceWeight[]) => {
    setConversations(importedConversations)
    if (importedSourceWeights) {
      setSourceWeights(importedSourceWeights)
    }
    if (importedConversations.length > 0) {
      setActiveConversationId(importedConversations[0].id)
    }
  }

  const updateConversation = (conversationId: string, updatedMessages: MessageType[]) => {
    setConversations((current) =>
      (current || []).map((conv) => {
        if (conv.id === conversationId) {
          const firstUserMessage = updatedMessages.find(m => m.role === 'user')
          const title = firstUserMessage 
            ? firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
            : 'New Conversation'
          
          return {
            ...conv,
            messages: updatedMessages,
            title,
            updatedAt: Date.now(),
          }
        }
        return conv
      })
    )
  }

  const appendQueryFlux = (words: string, zone: HolocronSourceZone = 'core') => {
    if (!words) return
    setQueryFlux((current) => [
      ...current.slice(-34),
      { id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, words, zone, createdAt: Date.now() },
    ])
  }

  const appendAnswerFlux = (words: string, zone: HolocronSourceZone) => {
    if (!words) return
    setAnswerFlux((current) => [
      ...current.slice(-34),
      { id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, words, zone, createdAt: Date.now() },
    ])
  }

  const handleToggleExpand = (id: string) => {
    if (!activeConversationId) return
    
    const updatedMessages = messages.map((msg) =>
      msg.id === id ? { ...msg, isExpanded: !msg.isExpanded } : msg
    )
    updateConversation(activeConversationId, updatedMessages)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!input.trim() || isProcessing || !activeConversationId) return

    const userMessage: MessageType = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    }

    const newMessages = [...messages, userMessage]
    updateConversation(activeConversationId, newMessages)
    setInput('')
    setIsProcessing(true)
    scheduleQueryFluxShards(userMessage.content, appendQueryFlux)
    setHolocronInteractionCount((n) => n + 1)

    try {
      const queryType = await classifyQueryType(userMessage.content)
      setCurrentQueryType(queryType)

      const relevance = await detectQuestionRelevance(userMessage.content)

      if (!relevance.isRelevant) {
        const systemMessage: MessageType = {
          id: `msg-${Date.now()}-sys`,
          role: 'system',
          content:
            relevance.reason === 'too_short'
              ? 'Could you provide more details?'
              : 'I respond best to clear questions. Could you rephrase?',
          timestamp: Date.now(),
        }
        updateConversation(activeConversationId, [...newMessages, systemMessage])
        setIsProcessing(false)
        return
      }

      const recentQueries = messages
        .filter((m) => m.role === 'user')
        .slice(-5)
        .map((m) => m.content)

      const isRepeat = checkIfRepeatQuestion(userMessage.content, recentQueries)

      if (isRepeat && messages.length > 2) {
        const systemMessage: MessageType = {
          id: `msg-${Date.now()}-sys`,
          role: 'system',
          content: 'This seems similar to a recent question. Check above for the answer.',
          timestamp: Date.now(),
        }
        updateConversation(activeConversationId, [...newMessages, systemMessage])
        setIsProcessing(false)
        return
      }

      if (!legacySparkMode) {
        const retrieving: AgentResult[] = [
          {
            agentName: 'Trask',
            source: 'holocron',
            snippet: '',
            confidence: 0,
            status: 'retrieving',
          },
        ]
        setActiveAgents(retrieving)

        try {
          const record = await traskAsk(
            userMessage.content,
            traskApiKey || undefined,
            !legacySparkMode && traskUsesSameOriginApi() && holocronThreadId ? holocronThreadId : undefined,
          )

          const finalizeAnswerUi = (rec: TraskHistoryRecordDto): void => {
            if (rec.status !== 'complete' || !rec.answer) return
            const doneAgents: AgentResult[] = [
              {
                agentName: 'Trask',
                source: 'holocron',
                snippet: rec.answer.slice(0, 280),
                confidence: 1,
                status: 'complete',
                retrievedContent: rec.answer,
              },
            ]
            setActiveAgents(doneAgents)
            setHolocronAnswerBondTicks((n) => n + 1)
            const touchedZones = new Set<HolocronSourceZone>()
            for (const src of rec.sources ?? []) {
              const zone = zoneFromSourceLabel(`${src.name} ${src.url}`)
              touchedZones.add(zone)
              setSourceMetrics((current) => ({
                ...current,
                [zone]: (current[zone] ?? 0) + 1,
              }))
            }
            if (touchedZones.size === 0) touchedZones.add('core')
            scheduleAnswerFluxShards(rec.answer, Array.from(touchedZones), appendAnswerFlux)
            setHolocronInteractionCount((n) => n + 1 + touchedZones.size)
          }

          if (record.status === 'complete' && record.answer) {
            finalizeAnswerUi(record)
            const mappedSources = (record.sources ?? []).map((s) => ({
              name: s.name,
              url: s.url,
              confidence: 1,
            }))
            const assistantMessage: MessageType = {
              id: `srv-${record.queryId}-a`,
              role: 'assistant',
              content: record.answer,
              expandedContent: record.answer,
              sources: mappedSources,
              timestamp: Date.parse(record.completedAt ?? record.createdAt) || Date.now(),
              isExpanded: false,
              agentResults: [
                {
                  agentName: 'Trask',
                  source: 'holocron',
                  snippet: record.answer.slice(0, 280),
                  confidence: 1,
                  status: 'complete',
                  retrievedContent: record.answer,
                },
              ],
              queryType: queryType,
            }
            updateConversation(activeConversationId, [...newMessages, assistantMessage])
          } else if (record.status === 'pending' && holocronThreadId) {
            let terminal: TraskHistoryRecordDto | undefined
            let completionHandled = false
            for (let attempt = 0; attempt < 900; attempt++) {
              let hist: TraskHistoryRecordDto[]
              try {
                hist = await traskGetThread(holocronThreadId)
              } catch {
                await new Promise((r) => window.setTimeout(r, 500))
                continue
              }
              syncThreadFromRemote(hist, { animateTrace: true })
              terminal = hist.find((r) => r.queryId === record.queryId)
              if (terminal?.status === 'complete' || terminal?.status === 'failed') {
                if (terminal.status === 'complete' && !completionHandled) {
                  completionHandled = true
                  finalizeAnswerUi(terminal)
                }
                break
              }
              await new Promise((r) => window.setTimeout(r, 420))
            }
            if (terminal?.status === 'failed') {
              toast.error(terminal.error ?? 'Trask research failed.')
            }
          }
        } catch (error) {
          console.error('Trask API error:', error)
          const msg = error instanceof Error ? error.message : 'Trask request failed.'
          toast.error(msg)
          const errMessage: MessageType = {
            id: `msg-${Date.now()}-trask-err`,
            role: 'system',
            content: `Research service error: ${msg}`,
            timestamp: Date.now(),
          }
          updateConversation(activeConversationId, [...newMessages, errMessage])
          appendAnswerFlux(shortFluxWords(msg, 3), 'core')
          setHolocronInteractionCount((n) => n + 1)
        } finally {
          setActiveAgents([])
        }
        return
      }

      const agentResults = await performMultiAgentRetrieval(userMessage.content, sourceWeights || DEFAULT_SOURCE_WEIGHTS, prompts)
      setActiveAgents(agentResults)

      await new Promise((resolve) => setTimeout(resolve, 500))

      const answer = await aggregateAnswer(userMessage.content, agentResults, prompts)

      const assistantMessage: MessageType = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: answer.concise,
        expandedContent: answer.expanded,
        sources: answer.sources,
        timestamp: Date.now(),
        isExpanded: false,
        agentResults: agentResults,
        queryType: queryType,
      }

      updateConversation(activeConversationId, [...newMessages, assistantMessage])
      setHolocronAnswerBondTicks((n) => n + 1)
      const legacyZones = new Set<HolocronSourceZone>()
      for (const src of answer.sources) {
        const zone = zoneFromSourceLabel(`${src.name} ${src.url ?? ''}`)
        legacyZones.add(zone)
        setSourceMetrics((current) => ({
          ...current,
          [zone]: (current[zone] ?? 0) + 1,
        }))
      }
      if (legacyZones.size === 0) {
        legacyZones.add('core')
      }
      scheduleAnswerFluxShards(answer.concise, Array.from(legacyZones), appendAnswerFlux)
      setHolocronInteractionCount((n) => n + 1 + legacyZones.size)
      setActiveAgents([])
    } catch (error) {
      console.error('Error processing question:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleHolocronLogout = async () => {
    await traskLogout()
    const next = await traskFetchSession()
    setHolocronSession({
      status: 'anonymous',
      oauthAvailable: Boolean(next?.oauthAvailable),
    })
  }

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-x-hidden overflow-y-hidden">
      <TopNav holocronSession={holocronSession} onHolocronLogout={handleHolocronLogout} />
      
      <div className="flex-1 flex min-h-0 mt-14 relative">
        <div className="holocron-atmosphere pointer-events-none overflow-visible" aria-hidden>
          <div className="holocron-atmosphere__panel" />
          <div className="holocron-atmosphere__halftone" />
          <div className="holocron-atmosphere__wash" />
          <div className="holocron-atmosphere__gradient" />
          <div className="holocron-atmosphere__vignette" />
        </div>
        <HolocronSanctum
          queryFlux={queryFlux}
          answerFlux={answerFlux}
          sourceMetrics={sourceMetrics}
          totalInteractions={holocronInteractionCount}
          isProcessing={isProcessing}
          answerBondTicks={holocronAnswerBondTicks}
          querySignature={holocronQuerySignature(holocronLiveQuery)}
          draftQuery={holocronLiveQuery}
          livePulses={livePulses}
        />
        
        <Toaster position="top-center" />
        
        <SourceWeightsDialog
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          sourceWeights={sourceWeights || DEFAULT_SOURCE_WEIGHTS}
          onSourceWeightsChange={(weights) => setSourceWeights(weights)}
          legacySparkMode={legacySparkMode}
          traskApiKey={traskApiKey || ''}
          onTraskApiKeyChange={(value) => setTraskApiKey(value)}
        />

        <KeyboardShortcutsDialog
          open={isShortcutsOpen}
          onOpenChange={setIsShortcutsOpen}
        />

        <PromptsDialog
          open={isPromptsOpen}
          onOpenChange={setIsPromptsOpen}
        />

        <ConversationSidebar
          conversations={conversations || []}
          activeConversationId={activeConversationId || null}
          onSelectConversation={handleSelectConversation}
          onCreateConversation={handleCreateConversation}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          sourceWeights={sourceWeights || DEFAULT_SOURCE_WEIGHTS}
          onImport={handleImportConversations}
          searchInputRef={searchInputRef}
        />

        <div className="flex-1 flex flex-col min-h-0 relative z-10 isolate bg-background/42 dark:bg-background/32 backdrop-blur-[6px] shadow-[inset_0_0_80px_oklch(0.98_0.02_95_/_0.06)] dark:shadow-[inset_0_0_100px_oklch(0.12_0.04_285_/_0.35)] border-l border-primary/15">
          <header className="border-b border-primary/30 bg-card/40 backdrop-blur-sm px-4 md:px-6 py-4 flex items-center justify-between gap-3 shadow-lg shadow-primary/10">
            <div className="flex items-center gap-3">
              <HolocronGlyph variant="header" />
              <h1 className="font-bold text-[22px] md:text-[28px] tracking-wide text-accent glow-text">
                HOLOCRON ARCHIVE
              </h1>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsPromptsOpen(true)}
                className="text-primary hover:text-accent hover:bg-primary/10 transition-all"
                aria-label="Edit AI prompts"
                title="AI Protocols (Ctrl+Shift+P)"
              >
                <Code size={20} weight="bold" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsShortcutsOpen(true)}
                className="text-primary hover:text-accent hover:bg-primary/10 transition-all"
                aria-label="Show keyboard shortcuts"
                title="Commands (Ctrl+/)"
              >
                <Keyboard size={20} weight="bold" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSettingsOpen(true)}
                className="text-primary hover:text-accent hover:bg-primary/10 transition-all"
                aria-label="Open settings"
                title="Data Source Configuration"
              >
                <Sliders size={20} weight="bold" />
              </Button>
            </div>
          </header>

          <div className="flex-1 flex flex-col min-h-0">
            <ScrollArea className="flex-1" ref={scrollRef}>
              <div className="py-6">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center min-h-[min(52vh,420px)] px-6 py-10 text-center relative z-[1]">
                    <h2 className="text-xl font-semibold text-accent mb-3 font-totj-serif">
                      Access Knowledge Repository
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
                      Ask a question below. Answers use Trask research when the API is available (run{' '}
                      <code className="text-xs rounded bg-muted px-1 py-0.5">trask-http-server</code> on port{' '}
                      <code className="text-xs rounded bg-muted px-1 py-0.5">4010</code> or open Holocron from the Discord bot link).
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                      {[
                        "How do I mod KotOR?",
                        "What is TSL:RCM?",
                        "Installing mods on mobile",
                      ].map((suggestion) => (
                        <Button
                          key={suggestion}
                          variant="outline"
                          size="sm"
                          onClick={() => setInput(suggestion)}
                          className="text-xs border-primary/40 text-primary hover:bg-primary/20 hover:text-accent hover:border-accent/60 transition-all"
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-4 md:px-6 space-y-0">
                  {messages.map((message) => (
                    <Message
                      key={message.id}
                      message={message}
                      onToggleExpand={handleToggleExpand}
                    />
                  ))}
                </div>

                {activeAgents.length > 0 && <AgentPanel agents={activeAgents} queryType={currentQueryType} />}
              </div>
            </ScrollArea>

            <div className="border-t border-primary/30 bg-card/70 backdrop-blur-md p-3 md:p-4 shadow-[0_-4px_24px_0_rgba(0,0,0,0.35)]">
              <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    id="question-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={activeConversationId ? 'Ask the Holocron anything…' : 'Preparing thread…'}
                    disabled={isProcessing || !activeConversationId}
                    className="flex-1 text-[15px] h-11 md:h-12 px-4 bg-background/85 border-primary/50 text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-accent/40"
                    aria-label="Question input"
                  />
                  <Button
                    type="submit"
                    disabled={!input.trim() || isProcessing || !activeConversationId}
                    size="lg"
                    className="h-11 md:h-12 px-4 md:px-6 bg-primary hover:bg-accent shadow-lg shadow-primary/30 hover:shadow-accent/30 transition-all"
                    aria-label="Submit question"
                  >
                    {isProcessing ? (
                      <span className="animate-spin">⟳</span>
                    ) : (
                      <ArrowRight size={20} weight="bold" />
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
