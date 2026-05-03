import { SourceWeight } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface SourceWeightsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceWeights: SourceWeight[]
  onSourceWeightsChange: (weights: SourceWeight[]) => void
  /** When false (default Trask API mode), show optional API key for secured servers. */
  legacySparkMode?: boolean
  traskApiKey?: string
  onTraskApiKeyChange?: (value: string) => void
}

export function SourceWeightsDialog({
  open,
  onOpenChange,
  sourceWeights,
  onSourceWeightsChange,
  legacySparkMode = false,
  traskApiKey = '',
  onTraskApiKeyChange,
}: SourceWeightsDialogProps) {
  const handleWeightChange = (index: number, weight: number) => {
    const updated = [...sourceWeights]
    updated[index] = { ...updated[index], weight }
    onSourceWeightsChange(updated)
  }

  const handleEnabledChange = (index: number, enabled: boolean) => {
    const updated = [...sourceWeights]
    updated[index] = { ...updated[index], enabled }
    onSourceWeightsChange(updated)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Source Prioritization</DialogTitle>
          <DialogDescription>
            Adjust how much each source influences the final answer. Higher weights
            mean that source's results are trusted more.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {sourceWeights.map((source, index) => (
            <Card key={source.name} className="p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">{source.name}</Label>
                    <p className="text-xs text-muted-foreground">{source.url}</p>
                  </div>
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(checked) => handleEnabledChange(index, checked)}
                  />
                </div>

                {source.enabled && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-muted-foreground">Weight</Label>
                      <span className="text-sm font-medium tabular-nums">
                        {source.weight.toFixed(1)}x
                      </span>
                    </div>
                    <Slider
                      value={[source.weight]}
                      onValueChange={([value]) => handleWeightChange(index, value)}
                      min={0.1}
                      max={2.0}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Low priority</span>
                      <span>High priority</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {!legacySparkMode && onTraskApiKeyChange && (
          <Card className="p-4 mt-4 border-primary/30">
            <div className="space-y-2">
              <Label className="text-base font-medium">Trask API key</Label>
              <p className="text-xs text-muted-foreground">
                Optional. Required when the server sets <code className="text-[10px]">TRASK_WEB_API_KEY</code>.
                Stored only in this browser.
              </p>
              <Input
                type="password"
                autoComplete="off"
                placeholder="Bearer token (same as TRASK_WEB_API_KEY)"
                value={traskApiKey}
                onChange={(e) => onTraskApiKeyChange(e.target.value)}
              />
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  )
}
