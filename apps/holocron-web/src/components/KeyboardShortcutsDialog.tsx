import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Keyboard } from '@phosphor-icons/react'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const shortcuts = [
  { keys: ['Ctrl/⌘', 'N'], description: 'New conversation' },
  { keys: ['Ctrl/⌘', 'K'], description: 'Focus search' },
  { keys: ['Ctrl/⌘', '/'], description: 'Show shortcuts' },
  { keys: ['Ctrl/⌘', 'E'], description: 'Export conversations' },
  { keys: ['Esc'], description: 'Close dialogs' },
]

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard size={24} weight="duotone" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate quickly
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-4">
          {shortcuts.map((shortcut, idx) => (
            <Card key={idx} className="p-3 flex items-center justify-between">
              <span className="text-sm text-foreground">{shortcut.description}</span>
              <div className="flex gap-1">
                {shortcut.keys.map((key, keyIdx) => (
                  <kbd
                    key={keyIdx}
                    className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
