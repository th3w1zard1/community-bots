import { AgentResult, Source, SourceWeight, ScrapedContent, QueryType } from './types'
import { scrapeDeadlyStream, scrapeLucasForums, searchGitHub, calculateRelevanceScore } from './scraper'
import { PromptTemplate } from './prompts'

export async function classifyQueryType(query: string): Promise<QueryType> {
  const lowerQuery = query.toLowerCase()
  
  const modPatterns = ['mod', 'install', 'patch', 'tslrcm', 'download', 'compatibility', 'texture', 'override']
  const lorePatterns = ['story', 'lore', 'character', 'plot', 'revan', 'sith', 'jedi', 'planet', 'who is', 'what happened']
  const technicalPatterns = ['error', 'crash', 'bug', 'fix', 'issue', 'problem', 'not working', 'help', 'troubleshoot']
  const generalPatterns = ['what is', 'how to', 'best', 'recommend', 'guide', 'tutorial', 'where']
  
  if (modPatterns.some(pattern => lowerQuery.includes(pattern))) {
    return 'modding'
  } else if (technicalPatterns.some(pattern => lowerQuery.includes(pattern))) {
    return 'technical'
  } else if (lorePatterns.some(pattern => lowerQuery.includes(pattern))) {
    return 'lore'
  } else if (generalPatterns.some(pattern => lowerQuery.includes(pattern))) {
    return 'general'
  }
  
  return 'general'
}

export async function detectQuestionRelevance(input: string): Promise<{ isRelevant: boolean; reason: string }> {
  const trimmed = input.trim()
  
  if (trimmed.length < 5) {
    return { isRelevant: false, reason: 'too_short' }
  }
  
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'is', 'does', 'are', 'do']
  const hasQuestionMark = trimmed.includes('?')
  const startsWithQuestionWord = questionWords.some(word => 
    trimmed.toLowerCase().startsWith(word + ' ')
  )
  
  const isLikelyQuestion = hasQuestionMark || startsWithQuestionWord
  
  if (!isLikelyQuestion) {
    return { isRelevant: false, reason: 'not_question' }
  }
  
  return { isRelevant: true, reason: 'valid' }
}

export async function performMultiAgentRetrieval(
  query: string, 
  sourceWeights: SourceWeight[],
  prompts?: PromptTemplate[]
): Promise<AgentResult[]> {
  const enabledSources = sourceWeights.filter(s => s.enabled)
  
  const agents: AgentResult[] = enabledSources.map(source => ({
    agentName: source.name,
    source: source.url,
    snippet: '',
    confidence: 0,
    status: 'retrieving' as const,
    retrievedContent: ''
  }))
  
  const getPrompt = (id: string) => prompts?.find(p => p.id === id)?.template
  
  const scraperMap: Record<string, (query: string, template?: string) => Promise<ScrapedContent[]>> = {
    'Deadly Stream': (q, t) => scrapeDeadlyStream(q, t || getPrompt('deadly-stream-search')),
    'Lucas Forums Archive': (q, t) => scrapeLucasForums(q, t || getPrompt('lucas-forums-search')),
    'GitHub Repository': (q, t) => searchGitHub(q, t || getPrompt('github-search'))
  }
  
  const retrievalPromises = enabledSources.map(async (source) => {
    try {
      const scraper = scraperMap[source.name]
      if (!scraper) {
        return {
          agentName: source.name,
          source: source.url,
          snippet: '',
          confidence: 0,
          status: 'failed' as const,
          retrievedContent: ''
        }
      }
      
      const results = await scraper(query, undefined)
      
      if (results.length === 0) {
        return {
          agentName: source.name,
          source: source.url,
          snippet: 'No relevant results found',
          confidence: 0,
          status: 'failed' as const,
          retrievedContent: ''
        }
      }
      
      const bestResult = results
        .map(r => ({ ...r, score: calculateRelevanceScore(r, query) * source.weight }))
        .sort((a, b) => b.score - a.score)[0]
      
      return {
        agentName: source.name,
        source: bestResult.url,
        snippet: bestResult.snippets[0] || bestResult.content.substring(0, 150),
        confidence: Math.min(bestResult.score, 0.95),
        status: 'complete' as const,
        retrievedContent: bestResult.content
      }
    } catch (error) {
      console.error(`Error retrieving from ${source.name}:`, error)
      return {
        agentName: source.name,
        source: source.url,
        snippet: 'Retrieval failed',
        confidence: 0,
        status: 'failed' as const,
        retrievedContent: ''
      }
    }
  })
  
  return await Promise.all(retrievalPromises)
}

export async function aggregateAnswer(
  query: string, 
  agentResults: AgentResult[],
  prompts?: PromptTemplate[]
): Promise<{
  concise: string
  expanded: string
  sources: Source[]
}> {
  const successfulResults = agentResults.filter(r => r.status === 'complete' && r.confidence > 0.65)
  
  if (successfulResults.length === 0) {
    return {
      concise: "I couldn't find reliable information on this topic.",
      expanded: "None of the available sources returned confident results for your query. You might want to rephrase your question or check the sources directly.",
      sources: []
    }
  }
  
  const conciseTemplate = prompts?.find(p => p.id === 'concise-answer')?.template || `You are a minimal Q&A assistant. Respond in exactly 1-2 sentences max.

User question: {query}

Available sources found: {sourceCount} sources with confidence scores ranging from {minConfidence} to {maxConfidence}

Provide a concise answer (1-2 sentences only). Be direct and specific.`

  const concisePromptText = conciseTemplate
    .replace('{query}', query)
    .replace('{sourceCount}', successfulResults.length.toString())
    .replace('{minConfidence}', Math.min(...successfulResults.map(r => r.confidence)).toFixed(2))
    .replace('{maxConfidence}', Math.max(...successfulResults.map(r => r.confidence)).toFixed(2))

  const prompt = window.spark.llmPrompt`${concisePromptText}`
  const concise = await window.spark.llm(prompt, 'gpt-4o-mini')
  
  const expandedTemplate = prompts?.find(p => p.id === 'expanded-answer')?.template || `You are a Q&A assistant. Provide a slightly more detailed explanation (3-4 sentences) for:

User question: {query}

Brief answer given: {conciseAnswer}

Add context and details while remaining concise.`

  const expandedPromptText = expandedTemplate
    .replace('{query}', query)
    .replace('{conciseAnswer}', concise)

  const expandedPrompt = window.spark.llmPrompt`${expandedPromptText}`
  const expanded = await window.spark.llm(expandedPrompt, 'gpt-4o-mini')
  
  const sources: Source[] = successfulResults.map(result => ({
    name: result.agentName,
    url: result.source,
    confidence: result.confidence
  }))
  
  return { concise, expanded, sources }
}

export function checkIfRepeatQuestion(query: string, recentQueries: string[]): boolean {
  const normalized = query.toLowerCase().trim()
  
  return recentQueries.some(recent => {
    const recentNormalized = recent.toLowerCase().trim()
    const similarity = calculateSimilarity(normalized, recentNormalized)
    return similarity > 0.75
  })
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/))
  const words2 = new Set(str2.split(/\s+/))
  
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}
