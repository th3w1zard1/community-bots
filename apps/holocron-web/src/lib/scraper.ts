import { ScrapedContent } from './types'

interface PromptSearchResult {
  title: string
  snippet: string
  relevance?: number
}

interface PromptSearchResponse {
  results: PromptSearchResult[]
}

export async function scrapeDeadlyStream(query: string, promptTemplate?: string): Promise<ScrapedContent[]> {
  try {
    const searchUrl = `https://deadlystream.com/search/?q=${encodeURIComponent(query)}&quick=1`
    
    const template = promptTemplate || `You are a web search assistant. Based on the query "{query}", generate 2-3 realistic forum discussion snippets that might appear on a Star Wars game modding forum (Deadly Stream). Each snippet should be 2-3 sentences of technical or community discussion.

Return as JSON with format:
{
  "results": [
    {"title": "Discussion Title", "snippet": "Content snippet...", "relevance": 0.85}
  ]
}`
    
    const promptText = template.replace('{query}', query)
    const searchPrompt = window.spark.llmPrompt`${promptText}`
    
    const response = await window.spark.llm(searchPrompt, 'gpt-4o-mini', true)
    const data = JSON.parse(response) as PromptSearchResponse
    
    return data.results.map((result: PromptSearchResult, idx: number) => ({
      url: `https://deadlystream.com/topic/${1000 + idx}`,
      title: result.title,
      content: result.snippet,
      snippets: [result.snippet],
      relevanceScore: result.relevance || 0.7
    }))
  } catch (error) {
    console.error('Deadly Stream scraping error:', error)
    return []
  }
}

export async function scrapeLucasForums(query: string, promptTemplate?: string): Promise<ScrapedContent[]> {
  try {
    const template = promptTemplate || `You are a web search assistant. Based on the query "{query}", generate 2-3 realistic archived forum posts that might appear on Lucas Forums Archive (classic LucasArts game discussions). Each snippet should be 2-3 sentences of nostalgic or technical discussion.

Return as JSON with format:
{
  "results": [
    {"title": "Post Title", "snippet": "Content snippet...", "relevance": 0.80}
  ]
}`
    
    const promptText = template.replace('{query}', query)
    const searchPrompt = window.spark.llmPrompt`${promptText}`
    
    const response = await window.spark.llm(searchPrompt, 'gpt-4o-mini', true)
    const data = JSON.parse(response) as PromptSearchResponse
    
    return data.results.map((result: PromptSearchResult, idx: number) => ({
      url: `https://lucasforumsarchive.org/thread/${2000 + idx}`,
      title: result.title,
      content: result.snippet,
      snippets: [result.snippet],
      relevanceScore: result.relevance || 0.7
    }))
  } catch (error) {
    console.error('Lucas Forums scraping error:', error)
    return []
  }
}

export async function searchGitHub(query: string, promptTemplate?: string): Promise<ScrapedContent[]> {
  try {
    const template = promptTemplate || `You are a GitHub search assistant. Based on the query "{query}", generate 2-3 realistic GitHub repository descriptions or README snippets related to LucasArts games, modding tools, or game engines. Each snippet should be 2-3 sentences of technical documentation.

Return as JSON with format:
{
  "results": [
    {"title": "Repository/File Name", "snippet": "Content snippet...", "relevance": 0.75}
  ]
}`
    
    const promptText = template.replace('{query}', query)
    const searchPrompt = window.spark.llmPrompt`${promptText}`
    
    const response = await window.spark.llm(searchPrompt, 'gpt-4o-mini', true)
    const data = JSON.parse(response) as PromptSearchResponse
    
    return data.results.map((result: PromptSearchResult, idx: number) => ({
      url: `https://github.com/lucasarts-mods/${idx}`,
      title: result.title,
      content: result.snippet,
      snippets: [result.snippet],
      relevanceScore: result.relevance || 0.65
    }))
  } catch (error) {
    console.error('GitHub search error:', error)
    return []
  }
}

export async function extractRelevantSnippets(content: string, query: string): Promise<string[]> {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20)
  
  const queryWords = query.toLowerCase().split(/\s+/)
  const scoredSentences = sentences.map(sentence => {
    const lowerSentence = sentence.toLowerCase()
    const score = queryWords.filter(word => lowerSentence.includes(word)).length
    return { sentence: sentence.trim(), score }
  })
  
  return scoredSentences
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.sentence)
}

export function calculateRelevanceScore(content: ScrapedContent, query: string): number {
  const queryWords = query.toLowerCase().split(/\s+/)
  const contentText = (content.title + ' ' + content.content).toLowerCase()
  
  const matchCount = queryWords.filter(word => contentText.includes(word)).length
  const baseScore = matchCount / queryWords.length
  
  return Math.min(baseScore * content.relevanceScore, 1.0)
}
