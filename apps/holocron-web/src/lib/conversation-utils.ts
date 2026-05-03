import { Conversation, ConversationFilters, DateFilter } from './types'

export function extractTopicsFromConversation(conversation: Conversation): string[] {
  const topics = new Set<string>()
  
  const allText = conversation.messages
    .map(m => m.content)
    .join(' ')
    .toLowerCase()

  const commonTopics = [
    'kotor', 'knights of the old republic', 'installation', 'mod', 'modding',
    'bug', 'crash', 'error', 'troubleshooting', 'graphics', 'gameplay',
    'character', 'quest', 'save', 'compatibility', 'patch', 'update',
    'texture', 'model', 'script', 'dialog', 'cutscene', 'force power',
    'lightsaber', 'companion', 'romance', 'alignment', 'dark side', 'light side',
    'tslrcm', 'restoration', 'content', 'mobile', 'android', 'ios', 'steam',
    'workshop', 'nexus', 'deadlystream', 'github', 'repository'
  ]

  commonTopics.forEach(topic => {
    if (allText.includes(topic)) {
      const capitalizedTopic = topic.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
      topics.add(capitalizedTopic)
    }
  })

  return Array.from(topics).slice(0, 5)
}

export function getAllTopicsFromConversations(conversations: Conversation[]): string[] {
  const allTopics = new Set<string>()
  
  conversations.forEach(conv => {
    const topics = conv.topics || extractTopicsFromConversation(conv)
    topics.forEach(topic => allTopics.add(topic))
  })
  
  return Array.from(allTopics).sort()
}

export function filterConversationsByDate(
  conversations: Conversation[],
  dateFilter: DateFilter,
  customRange?: { start: number; end: number }
): Conversation[] {
  const now = Date.now()
  
  switch (dateFilter) {
    case 'all':
      return conversations
    
    case 'today': {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      return conversations.filter(c => c.updatedAt >= startOfDay.getTime())
    }
    
    case 'week': {
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000
      return conversations.filter(c => c.updatedAt >= weekAgo)
    }
    
    case 'month': {
      const monthAgo = now - 30 * 24 * 60 * 60 * 1000
      return conversations.filter(c => c.updatedAt >= monthAgo)
    }
    
    case 'custom': {
      if (!customRange) return conversations
      return conversations.filter(
        c => c.updatedAt >= customRange.start && c.updatedAt <= customRange.end
      )
    }
    
    default:
      return conversations
  }
}

export function searchConversations(
  conversations: Conversation[],
  query: string
): Conversation[] {
  if (!query.trim()) return conversations
  
  const lowerQuery = query.toLowerCase()
  
  return conversations.filter(conversation => {
    const titleMatch = conversation.title.toLowerCase().includes(lowerQuery)
    
    const messageMatch = conversation.messages.some(msg => 
      msg.content.toLowerCase().includes(lowerQuery) ||
      (msg.expandedContent && msg.expandedContent.toLowerCase().includes(lowerQuery))
    )
    
    const topicMatch = conversation.topics?.some(topic =>
      topic.toLowerCase().includes(lowerQuery)
    )
    
    return titleMatch || messageMatch || topicMatch
  })
}

export function filterConversationsByTopics(
  conversations: Conversation[],
  selectedTopics: string[]
): Conversation[] {
  if (selectedTopics.length === 0) return conversations
  
  return conversations.filter(conversation => {
    const topics = conversation.topics || []
    return selectedTopics.some(selectedTopic => 
      topics.includes(selectedTopic)
    )
  })
}

export function applyFilters(
  conversations: Conversation[],
  filters: ConversationFilters
): Conversation[] {
  let filtered = conversations

  filtered = filterConversationsByDate(
    filtered,
    filters.dateFilter,
    filters.customDateRange
  )

  if (filters.selectedTopics.length > 0) {
    filtered = filterConversationsByTopics(filtered, filters.selectedTopics)
  }

  if (filters.searchQuery.trim()) {
    filtered = searchConversations(filtered, filters.searchQuery)
  }

  return filtered
}

export function sortConversations(
  conversations: Conversation[],
  sortBy: 'recent' | 'oldest' | 'title' = 'recent'
): Conversation[] {
  return [...conversations].sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        return b.updatedAt - a.updatedAt
      case 'oldest':
        return a.updatedAt - b.updatedAt
      case 'title':
        return a.title.localeCompare(b.title)
      default:
        return 0
    }
  })
}
