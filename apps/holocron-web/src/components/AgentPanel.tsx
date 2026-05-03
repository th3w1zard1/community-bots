import { AgentResult, QueryType } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MagnifyingGlass, CheckCircle, XCircle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { HolocronLoader } from '@/components/HolocronLoader'

interface AgentPanelProps {
  agents: AgentResult[]
  queryType?: QueryType
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) {
    return 'bg-accent/20 text-accent border-accent/40 shadow-[0_0_8px_-2px] shadow-accent/30'
  } else if (confidence >= 0.65) {
    return 'bg-primary/20 text-primary border-primary/40 shadow-[0_0_6px_-2px] shadow-primary/30'
  } else if (confidence >= 0.4) {
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 shadow-[0_0_6px_-2px] shadow-yellow-500/30'
  } else {
    return 'bg-destructive/20 text-destructive border-destructive/40 shadow-[0_0_6px_-2px] shadow-destructive/30'
  }
}

export function AgentPanel({ agents, queryType = 'general' }: AgentPanelProps) {
  if (agents.length === 0) return null

  const hasAnyRetrieving = agents.some(agent => agent.status === 'retrieving')

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 px-6"
    >
      {hasAnyRetrieving && (
        <div className="flex flex-col items-center mb-4">
          <HolocronLoader queryType={queryType} />
          <p className="text-xs text-accent font-medium uppercase tracking-wider mt-2">
            Accessing Archives...
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Querying Archives...</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {agents.map((agent, idx) => (
          <motion.div
            key={agent.agentName}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="px-3 py-2 bg-card/60 border-primary/30 backdrop-blur-sm shadow-lg shadow-primary/10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {agent.status === 'retrieving' && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <MagnifyingGlass size={14} className="text-primary flex-shrink-0 drop-shadow-[0_0_4px_currentColor]" />
                    </motion.div>
                  )}
                  {agent.status === 'complete' && (
                    <CheckCircle size={14} weight="fill" className="text-accent flex-shrink-0 drop-shadow-[0_0_4px_currentColor]" />
                  )}
                  {agent.status === 'failed' && (
                    <XCircle size={14} weight="fill" className="text-muted-foreground/50 flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-foreground truncate">
                    {agent.agentName}
                  </span>
                </div>
                {agent.status === 'complete' && agent.confidence > 0 && (
                  <Badge 
                    variant="secondary" 
                    className={`text-[10px] px-1.5 py-0 h-auto font-semibold border ${getConfidenceColor(agent.confidence)}`}
                  >
                    {Math.round(agent.confidence * 100)}%
                  </Badge>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
