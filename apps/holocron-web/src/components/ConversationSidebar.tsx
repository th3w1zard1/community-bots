import { useState, useMemo, useRef, useEffect } from 'react'
import { Conversation, ConversationFilters, DateFilter, SourceWeight } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ConversationFilterDialog } from '@/components/ConversationFilterDialog'
import { ExportImportDialog } from '@/components/ExportImportDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Plus, Trash, ChatCircle, MagnifyingGlass, Funnel, X, HardDrives, PencilSimple, Check } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  applyFilters,
  sortConversations,
  getAllTopicsFromConversations,
  extractTopicsFromConversation,
} from '@/lib/conversation-utils'

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onCreateConversation: () => void
  onDeleteConversation: (id: string) => void
  onRenameConversation: (id: string, newTitle: string) => void
  sourceWeights: SourceWeight[]
  onImport: (conversations: Conversation[], sourceWeights?: SourceWeight[]) => void
  searchInputRef: React.RefObject<HTMLInputElement | null>
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  onRenameConversation,
  sourceWeights,
  onImport,
  searchInputRef,
}: ConversationSidebarProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isExportImportOpen, setIsExportImportOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const [filters, setFilters] = useState<ConversationFilters>({
    searchQuery: '',
    dateFilter: 'all',
    selectedTopics: [],
  })

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const enrichedConversations = useMemo(() => {
    return conversations.map(conv => ({
      ...conv,
      topics: conv.topics || extractTopicsFromConversation(conv),
    }))
  }, [conversations])

  const availableTopics = useMemo(() => {
    return getAllTopicsFromConversations(enrichedConversations)
  }, [enrichedConversations])

  const filteredConversations = useMemo(() => {
    const filtered = applyFilters(enrichedConversations, filters)
    return sortConversations(filtered, 'recent')
  }, [enrichedConversations, filters])

  const handleDateFilterChange = (dateFilter: DateFilter) => {
    setFilters(prev => ({ ...prev, dateFilter }))
  }

  const handleCustomDateRangeChange = (range: { start: number; end: number } | undefined) => {
    setFilters(prev => ({ ...prev, customDateRange: range }))
  }

  const handleSelectedTopicsChange = (topics: string[]) => {
    setFilters(prev => ({ ...prev, selectedTopics: topics }))
  }

  const clearSearch = () => {
    setFilters(prev => ({ ...prev, searchQuery: '' }))
  }

  const activeFilterCount = 
    (filters.dateFilter !== 'all' ? 1 : 0) + filters.selectedTopics.length

  const handleStartEdit = (conversation: Conversation, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(conversation.id)
    setEditingTitle(conversation.title)
  }

  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim()) {
      onRenameConversation(editingId, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirmId(id)
  }

  const handleConfirmDelete = () => {
    if (deleteConfirmId) {
      onDeleteConversation(deleteConfirmId)
      setDeleteConfirmId(null)
    }
  }

  return (
    <div className="w-80 border-r border-primary/30 flex flex-col h-full relative z-10 isolate bg-background/55 dark:bg-background/40 backdrop-blur-[4px]">
      <ConfirmDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        title="Delete conversation?"
        description="This action cannot be undone. All messages in this conversation will be permanently deleted."
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
      />
      
      <ConversationFilterDialog
        open={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        dateFilter={filters.dateFilter}
        onDateFilterChange={handleDateFilterChange}
        customDateRange={filters.customDateRange}
        onCustomDateRangeChange={handleCustomDateRangeChange}
        selectedTopics={filters.selectedTopics}
        onSelectedTopicsChange={handleSelectedTopicsChange}
        availableTopics={availableTopics}
      />

      <ExportImportDialog
        open={isExportImportOpen}
        onOpenChange={setIsExportImportOpen}
        conversations={conversations}
        sourceWeights={sourceWeights}
        onImport={onImport}
      />

      <div className="p-4 border-b border-primary/30 space-y-3">
        <Button
          onClick={onCreateConversation}
          className="w-full bg-primary hover:bg-accent shadow-lg shadow-primary/20 hover:shadow-accent/20 transition-all"
          size="sm"
        >
          <Plus size={16} weight="bold" className="mr-2" />
          New Query
        </Button>

        <div className="relative">
          <MagnifyingGlass 
            size={16} 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" 
          />
          <Input
            ref={searchInputRef}
            id="conversation-search"
            value={filters.searchQuery}
            onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="Search archives..."
            className="pl-9 pr-9 h-9 text-sm bg-background/60 border-primary/40 focus:border-accent"
            aria-label="Search conversations"
          />
          {filters.searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-accent transition-colors"
              aria-label="Clear search"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterOpen(true)}
            className="flex-1 relative border-primary/40 hover:bg-primary/10 hover:border-accent/60 transition-all"
          >
            <Funnel size={16} weight="bold" className="mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <Badge 
                variant="default" 
                className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-accent shadow-[0_0_8px_-2px] shadow-accent/50"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExportImportOpen(true)}
            className="px-3 border-primary/40 hover:bg-primary/10 hover:border-accent/60 transition-all"
          >
            <HardDrives size={16} weight="bold" />
          </Button>
        </div>

        {filters.selectedTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filters.selectedTopics.map(topic => (
              <Badge
                key={topic}
                variant="secondary"
                className="text-xs px-2 py-0.5 bg-primary/20 border-primary/30 text-primary"
              >
                {topic}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {filteredConversations.length === 0 && conversations.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No conversations yet
            </div>
          )}

          {filteredConversations.length === 0 && conversations.length > 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No conversations match your filters
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {filteredConversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId
              const messageCount = conversation.messages.length
              const lastMessageTime = conversation.updatedAt
              const timeAgo = getTimeAgo(lastMessageTime)

              return (
                <motion.div
                  key={conversation.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  layout
                >
                  <Card
                    className={`p-3 cursor-pointer transition-all hover:bg-primary/20 hover:border-accent/60 group ${
                      isActive ? 'bg-primary/30 border-accent/50 shadow-lg shadow-accent/10' : 'bg-card/40 border-primary/30'
                    }`}
                    onClick={() => !editingId && onSelectConversation(conversation.id)}
                  >
                    <div className="flex items-start gap-2">
                      <ChatCircle
                        size={18}
                        weight="fill"
                        className={`flex-shrink-0 mt-0.5 ${
                          isActive ? 'text-accent drop-shadow-[0_0_4px_currentColor]' : 'text-primary'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        {editingId === conversation.id ? (
                          <Input
                            ref={editInputRef}
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit()
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                            onBlur={handleSaveEdit}
                            className="h-7 text-sm px-2 bg-background/60 border-primary/40"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <h3
                            className={`text-sm font-medium truncate ${
                              isActive ? 'text-accent' : 'text-foreground'
                            }`}
                          >
                            {conversation.title}
                          </h3>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-muted-foreground">
                            {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                          </p>
                          <p className="text-xs text-muted-foreground">{timeAgo}</p>
                        </div>
                        {conversation.topics && conversation.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {conversation.topics.slice(0, 2).map(topic => (
                              <Badge 
                                key={topic} 
                                variant="outline" 
                                className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary"
                              >
                                {topic}
                              </Badge>
                            ))}
                            {conversation.topics.length > 2 && (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary"
                              >
                                +{conversation.topics.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      {editingId !== conversation.id && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 hover:bg-primary/20 text-primary hover:text-accent"
                            onClick={(e) => handleStartEdit(conversation, e)}
                            aria-label="Rename conversation"
                          >
                            <PencilSimple size={14} weight="bold" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 hover:bg-destructive/20 text-destructive hover:text-destructive"
                            onClick={(e) => handleDeleteClick(conversation.id, e)}
                            aria-label="Delete conversation"
                          >
                            <Trash size={14} weight="bold" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  )
}

function getTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
