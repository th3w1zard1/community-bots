export type MessageRole = 'user' | 'assistant' | 'system'

export type QueryType = 'modding' | 'technical' | 'lore' | 'general'

export interface Message {
  id: string
  role: MessageRole
  content: string
  expandedContent?: string
  sources?: Source[]
  timestamp: number
  isExpanded?: boolean
  agentResults?: AgentResult[]
  isAgentPanelExpanded?: boolean
  queryType?: QueryType
}

export interface Source {
  name: string
  url: string
  confidence: number
}

export interface AgentResult {
  agentName: string
  source: string
  snippet: string
  confidence: number
  status: 'retrieving' | 'complete' | 'failed'
  retrievedContent?: string
}

export interface SourceWeight {
  name: string
  url: string
  weight: number
  enabled: boolean
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  topics?: string[]
}

export type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom'

export interface ConversationFilters {
  searchQuery: string
  dateFilter: DateFilter
  customDateRange?: { start: number; end: number }
  selectedTopics: string[]
}

export interface ScrapedContent {
  url: string
  title: string
  content: string
  snippets: string[]
  relevanceScore: number
}

export const DEFAULT_SOURCE_WEIGHTS: SourceWeight[] = [
  { name: 'Lucas Forums Archive', url: 'https://lucasforumsarchive.org', weight: 1.0, enabled: true },
  { name: 'Deadly Stream', url: 'https://deadlystream.com', weight: 1.0, enabled: true },
  { name: 'GitHub Repository', url: 'https://github.com', weight: 1.2, enabled: true }
]

const MESSAGE_ROLES: readonly MessageRole[] = ['user', 'assistant', 'system']

export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const o = value as Record<string, unknown>
  return (
    typeof o.id === 'string'
    && typeof o.role === 'string'
    && MESSAGE_ROLES.includes(o.role as MessageRole)
    && typeof o.content === 'string'
    && typeof o.timestamp === 'number'
    && Number.isFinite(o.timestamp)
  )
}

export function isMessageArray(value: unknown): value is Message[] {
  return Array.isArray(value) && value.every(isMessage)
}
