import { useState, useRef } from 'react'
import { Conversation, SourceWeight } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, Upload, CheckCircle, Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  exportConversations,
  downloadExport,
  readImportFile,
  mergeConversations,
} from '@/lib/export-utils'

interface ExportImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversations: Conversation[]
  sourceWeights: SourceWeight[]
  onImport: (conversations: Conversation[], sourceWeights?: SourceWeight[]) => void
}

export function ExportImportDialog({
  open,
  onOpenChange,
  conversations,
  sourceWeights,
  onImport,
}: ExportImportDialogProps) {
  const [mode, setMode] = useState<'export' | 'import'>('export')
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge')
  const [isProcessing, setIsProcessing] = useState(false)
  const [importPreview, setImportPreview] = useState<{
    conversations: Conversation[]
    sourceWeights?: SourceWeight[]
    newCount: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    try {
      const data = exportConversations(conversations, sourceWeights)
      downloadExport(data)
      toast.success('Conversations exported successfully')
      onOpenChange(false)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export conversations')
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsProcessing(true)

    try {
      const result = await readImportFile(file)

      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to read file')
        setIsProcessing(false)
        return
      }

      const merged = mergeConversations(conversations, result.data.conversations, importStrategy)
      const newCount = merged.length - conversations.length

      setImportPreview({
        conversations: result.data.conversations,
        sourceWeights: result.data.sourceWeights,
        newCount,
      })

      toast.success(`Found ${result.data.conversations.length} conversation(s)`)
    } catch (error) {
      console.error('Import failed:', error)
      toast.error('Failed to import file')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImport = () => {
    if (!importPreview) return

    try {
      const merged = mergeConversations(
        conversations,
        importPreview.conversations,
        importStrategy
      )

      onImport(merged, importPreview.sourceWeights)
      toast.success(
        importStrategy === 'replace'
          ? 'Conversations replaced successfully'
          : `${importPreview.newCount} new conversation(s) imported`
      )
      onOpenChange(false)
      setImportPreview(null)
    } catch (error) {
      console.error('Import failed:', error)
      toast.error('Failed to import conversations')
    }
  }

  const handleCancel = () => {
    setImportPreview(null)
    setMode('export')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen)
      if (!isOpen) {
        handleCancel()
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Backup & Restore</DialogTitle>
          <DialogDescription>
            Export your conversations to backup or import from a previous backup
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Action</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => {
                setMode(value as 'export' | 'import')
                setImportPreview(null)
              }}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="export" id="export" />
                <Label htmlFor="export" className="font-normal cursor-pointer">
                  Export conversations
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="import" id="import" />
                <Label htmlFor="import" className="font-normal cursor-pointer">
                  Import conversations
                </Label>
              </div>
            </RadioGroup>
          </div>

          {mode === 'export' && (
            <Alert>
              <Download size={16} className="text-accent-foreground" />
              <AlertDescription>
                Export {conversations.length} conversation(s) and source weight settings to a JSON file
              </AlertDescription>
            </Alert>
          )}

          {mode === 'import' && (
            <>
              <div className="space-y-3">
                <Label>Import Strategy</Label>
                <RadioGroup
                  value={importStrategy}
                  onValueChange={(value) => setImportStrategy(value as 'merge' | 'replace')}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="merge" id="merge" />
                    <Label htmlFor="merge" className="font-normal cursor-pointer">
                      Merge (keep existing + add new)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="replace" id="replace" />
                    <Label htmlFor="replace" className="font-normal cursor-pointer">
                      Replace (remove all existing)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {importStrategy === 'replace' && (
                <Alert>
                  <Warning size={16} className="text-destructive" />
                  <AlertDescription className="text-destructive">
                    This will permanently delete all {conversations.length} existing conversation(s)
                  </AlertDescription>
                </Alert>
              )}

              {importPreview && (
                <Alert>
                  <CheckCircle size={16} className="text-accent-foreground" weight="fill" />
                  <AlertDescription>
                    {importStrategy === 'replace'
                      ? `Ready to replace with ${importPreview.conversations.length} conversation(s)`
                      : `Ready to import ${importPreview.newCount} new conversation(s)`}
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  <Upload size={16} weight="bold" className="mr-2" />
                  {isProcessing ? 'Processing...' : 'Select File'}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              handleCancel()
            }}
          >
            Cancel
          </Button>
          {mode === 'export' && (
            <Button onClick={handleExport} disabled={conversations.length === 0}>
              <Download size={16} weight="bold" className="mr-2" />
              Export
            </Button>
          )}
          {mode === 'import' && (
            <Button onClick={handleImport} disabled={!importPreview}>
              <Upload size={16} weight="bold" className="mr-2" />
              Import
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
