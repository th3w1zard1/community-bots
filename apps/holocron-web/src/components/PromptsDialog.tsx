import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowCounterClockwise, Check, Code } from '@phosphor-icons/react'
import { usePrompts, PromptTemplate } from '@/lib/prompts'
import { toast } from 'sonner'

interface PromptsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PromptsDialog({ open, onOpenChange }: PromptsDialogProps) {
  const { prompts, updatePrompt, resetPrompt, resetAllPrompts } = usePrompts()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [activeCategory, setActiveCategory] = useState<'scraping' | 'answering' | 'analysis'>('scraping')

  const categorizedPrompts = {
    scraping: prompts.filter(p => p.category === 'scraping'),
    answering: prompts.filter(p => p.category === 'answering'),
    analysis: prompts.filter(p => p.category === 'analysis')
  }

  const handleEdit = (prompt: PromptTemplate) => {
    setEditingId(prompt.id)
    setEditValue(prompt.template)
  }

  const handleSave = (id: string) => {
    updatePrompt(id, editValue)
    setEditingId(null)
    toast.success('Prompt updated')
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditValue('')
  }

  const handleReset = (id: string) => {
    resetPrompt(id)
    setEditingId(null)
    toast.success('Prompt reset to default')
  }

  const handleResetAll = () => {
    if (confirm('Reset all prompts to their default values? This cannot be undone.')) {
      resetAllPrompts()
      setEditingId(null)
      toast.success('All prompts reset to defaults')
    }
  }

  const renderPrompt = (prompt: PromptTemplate) => {
    const isEditing = editingId === prompt.id
    const isModified = prompt.template !== prompt.defaultTemplate

    return (
      <div key={prompt.id} className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm">{prompt.name}</h4>
              {isModified && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Modified
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{prompt.description}</p>
            {prompt.variables.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {prompt.variables.map(variable => (
                  <Badge key={variable} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {`{${variable}}`}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="min-h-[200px] font-mono text-xs"
              placeholder="Enter prompt template..."
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSave(prompt.id)}>
                <Check size={14} weight="bold" className="mr-1" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              {isModified && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReset(prompt.id)}
                  className="ml-auto"
                >
                  <ArrowCounterClockwise size={14} weight="bold" className="mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
              {prompt.template}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleEdit(prompt)}>
                <Code size={14} weight="bold" className="mr-1" />
                Edit
              </Button>
              {isModified && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleReset(prompt.id)}
                >
                  <ArrowCounterClockwise size={14} weight="bold" className="mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>AI Prompts</DialogTitle>
          <DialogDescription>
            View and customize the prompts powering the AI features. Changes are saved automatically.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as 'scraping' | 'answering' | 'analysis')} className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-3 pb-3">
            <TabsList>
              <TabsTrigger value="scraping">
                Scraping ({categorizedPrompts.scraping.length})
              </TabsTrigger>
              <TabsTrigger value="answering">
                Answering ({categorizedPrompts.answering.length})
              </TabsTrigger>
              <TabsTrigger value="analysis">
                Analysis ({categorizedPrompts.analysis.length})
              </TabsTrigger>
            </TabsList>

            <Button
              size="sm"
              variant="outline"
              onClick={handleResetAll}
            >
              <ArrowCounterClockwise size={16} weight="bold" className="mr-1" />
              Reset All
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <TabsContent value="scraping" className="space-y-3 mt-0 pr-4">
              {categorizedPrompts.scraping.map(renderPrompt)}
            </TabsContent>

            <TabsContent value="answering" className="space-y-3 mt-0 pr-4">
              {categorizedPrompts.answering.map(renderPrompt)}
            </TabsContent>

            <TabsContent value="analysis" className="space-y-3 mt-0 pr-4">
              {categorizedPrompts.analysis.map(renderPrompt)}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
