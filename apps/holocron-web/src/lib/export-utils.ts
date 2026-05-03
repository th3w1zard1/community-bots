import { Conversation, SourceWeight } from '@/lib/types'

export interface ExportData {
  version: string
  exportDate: number
  conversations: Conversation[]
  sourceWeights?: SourceWeight[]
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export function exportConversations(
  conversations: Conversation[],
  sourceWeights?: SourceWeight[]
): string {
  const exportData: ExportData = {
    version: '1.0.0',
    exportDate: Date.now(),
    conversations,
    sourceWeights,
  }

  return JSON.stringify(exportData, null, 2)
}

export function downloadExport(data: string, filename?: string): void {
  const timestamp = new Date().toISOString().split('T')[0]
  const defaultFilename = `qa-assistant-backup-${timestamp}.json`
  
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  
  link.href = url
  link.download = filename || defaultFilename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function validateImportData(data: unknown): { valid: boolean; error?: string; data?: ExportData } {
  try {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, error: 'Invalid file format' }
    }

    const importData = data as Partial<ExportData>

    if (!importData.version) {
      return { valid: false, error: 'Missing version information' }
    }

    if (!importData.conversations || !Array.isArray(importData.conversations)) {
      return { valid: false, error: 'Invalid conversations data' }
    }

    for (const conv of importData.conversations) {
      if (!conv.id || !conv.title || !Array.isArray(conv.messages) || 
          typeof conv.createdAt !== 'number' || typeof conv.updatedAt !== 'number') {
        return { valid: false, error: 'Invalid conversation structure' }
      }

      for (const msg of conv.messages) {
        if (!msg.id || !msg.role || !msg.content || typeof msg.timestamp !== 'number') {
          return { valid: false, error: 'Invalid message structure' }
        }
      }
    }

    return { valid: true, data: importData as ExportData }
  } catch (error) {
    return { valid: false, error: 'Failed to parse file' }
  }
}

export async function readImportFile(file: File): Promise<{ success: boolean; data?: ExportData; error?: string }> {
  try {
    const text = await file.text()
    const parsed: unknown = JSON.parse(text)
    const validation = validateImportData(parsed)

    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    return { success: true, data: validation.data }
  } catch (error) {
    return { success: false, error: 'Failed to read file' }
  }
}

export function mergeConversations(
  existing: Conversation[],
  imported: Conversation[],
  strategy: 'replace' | 'merge' = 'merge'
): Conversation[] {
  if (strategy === 'replace') {
    return imported
  }

  const existingIds = new Set(existing.map(c => c.id))
  const newConversations = imported.filter(c => !existingIds.has(c.id))

  return [...existing, ...newConversations]
}
