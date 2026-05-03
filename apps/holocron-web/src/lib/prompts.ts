import { useKV } from '@github/spark/hooks'

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: 'scraping' | 'answering' | 'analysis'
  template: string
  defaultTemplate: string
  variables: string[]
}

export const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: 'deadly-stream-search',
    name: 'Deadly Stream Search',
    description: 'Generates realistic forum discussion snippets from Deadly Stream modding community',
    category: 'scraping',
    template: `You are a web search assistant. Based on the query "{query}", generate 2-3 realistic forum discussion snippets that might appear on a Star Wars game modding forum (Deadly Stream). Each snippet should be 2-3 sentences of technical or community discussion.

Return as JSON with format:
{
  "results": [
    {"title": "Discussion Title", "snippet": "Content snippet...", "relevance": 0.85}
  ]
}`,
    defaultTemplate: `You are a web search assistant. Based on the query "{query}", generate 2-3 realistic forum discussion snippets that might appear on a Star Wars game modding forum (Deadly Stream). Each snippet should be 2-3 sentences of technical or community discussion.

Return as JSON with format:
{
  "results": [
    {"title": "Discussion Title", "snippet": "Content snippet...", "relevance": 0.85}
  ]
}`,
    variables: ['query']
  },
  {
    id: 'lucas-forums-search',
    name: 'Lucas Forums Archive Search',
    description: 'Generates archived forum posts from Lucas Forums classic discussions',
    category: 'scraping',
    template: `You are a web search assistant. Based on the query "{query}", generate 2-3 realistic archived forum posts that might appear on Lucas Forums Archive (classic LucasArts game discussions). Each snippet should be 2-3 sentences of nostalgic or technical discussion.

Return as JSON with format:
{
  "results": [
    {"title": "Post Title", "snippet": "Content snippet...", "relevance": 0.80}
  ]
}`,
    defaultTemplate: `You are a web search assistant. Based on the query "{query}", generate 2-3 realistic archived forum posts that might appear on Lucas Forums Archive (classic LucasArts game discussions). Each snippet should be 2-3 sentences of nostalgic or technical discussion.

Return as JSON with format:
{
  "results": [
    {"title": "Post Title", "snippet": "Content snippet...", "relevance": 0.80}
  ]
}`,
    variables: ['query']
  },
  {
    id: 'github-search',
    name: 'GitHub Repository Search',
    description: 'Generates GitHub repository and documentation snippets for LucasArts modding',
    category: 'scraping',
    template: `You are a GitHub search assistant. Based on the query "{query}", generate 2-3 realistic GitHub repository descriptions or README snippets related to LucasArts games, modding tools, or game engines. Each snippet should be 2-3 sentences of technical documentation.

Return as JSON with format:
{
  "results": [
    {"title": "Repository/File Name", "snippet": "Content snippet...", "relevance": 0.75}
  ]
}`,
    defaultTemplate: `You are a GitHub search assistant. Based on the query "{query}", generate 2-3 realistic GitHub repository descriptions or README snippets related to LucasArts games, modding tools, or game engines. Each snippet should be 2-3 sentences of technical documentation.

Return as JSON with format:
{
  "results": [
    {"title": "Repository/File Name", "snippet": "Content snippet...", "relevance": 0.75}
  ]
}`,
    variables: ['query']
  },
  {
    id: 'concise-answer',
    name: 'Concise Answer Generator',
    description: 'Creates ultra-brief 1-2 sentence answers from aggregated sources',
    category: 'answering',
    template: `You are a minimal Q&A assistant. Respond in exactly 1-2 sentences max.

User question: {query}

Available sources found: {sourceCount} sources with confidence scores ranging from {minConfidence} to {maxConfidence}

Provide a concise answer (1-2 sentences only). Be direct and specific.`,
    defaultTemplate: `You are a minimal Q&A assistant. Respond in exactly 1-2 sentences max.

User question: {query}

Available sources found: {sourceCount} sources with confidence scores ranging from {minConfidence} to {maxConfidence}

Provide a concise answer (1-2 sentences only). Be direct and specific.`,
    variables: ['query', 'sourceCount', 'minConfidence', 'maxConfidence']
  },
  {
    id: 'expanded-answer',
    name: 'Expanded Answer Generator',
    description: 'Provides detailed 3-4 sentence explanations with context',
    category: 'answering',
    template: `You are a Q&A assistant. Provide a slightly more detailed explanation (3-4 sentences) for:

User question: {query}

Brief answer given: {conciseAnswer}

Add context and details while remaining concise.`,
    defaultTemplate: `You are a Q&A assistant. Provide a slightly more detailed explanation (3-4 sentences) for:

User question: {query}

Brief answer given: {conciseAnswer}

Add context and details while remaining concise.`,
    variables: ['query', 'conciseAnswer']
  },
  {
    id: 'conversation-title',
    name: 'Conversation Title Generator',
    description: 'Generates concise titles for conversations based on first message',
    category: 'analysis',
    template: `Generate a brief title (5-7 words max) for a conversation that starts with: "{firstMessage}"

The title should capture the main topic or question. Return only the title, no quotes or extra text.`,
    defaultTemplate: `Generate a brief title (5-7 words max) for a conversation that starts with: "{firstMessage}"

The title should capture the main topic or question. Return only the title, no quotes or extra text.`,
    variables: ['firstMessage']
  },
  {
    id: 'topic-extraction',
    name: 'Topic Tag Extraction',
    description: 'Extracts relevant topic tags from conversation messages',
    category: 'analysis',
    template: `Analyze this conversation and extract 2-4 relevant topic tags. Tags should be single words or short phrases (2 words max).

Conversation messages:
{messages}

Return as JSON with format:
{
  "topics": ["topic1", "topic2", "topic3"]
}`,
    defaultTemplate: `Analyze this conversation and extract 2-4 relevant topic tags. Tags should be single words or short phrases (2 words max).

Conversation messages:
{messages}

Return as JSON with format:
{
  "topics": ["topic1", "topic2", "topic3"]
}`,
    variables: ['messages']
  }
]

export function usePrompts() {
  const [prompts, setPrompts] = useKV<PromptTemplate[]>('user-prompts', DEFAULT_PROMPTS)
  
  const updatePrompt = (id: string, newTemplate: string) => {
    setPrompts((current) => 
      (current || DEFAULT_PROMPTS).map(p => 
        p.id === id ? { ...p, template: newTemplate } : p
      )
    )
  }
  
  const resetPrompt = (id: string) => {
    setPrompts((current) => 
      (current || DEFAULT_PROMPTS).map(p => 
        p.id === id ? { ...p, template: p.defaultTemplate } : p
      )
    )
  }
  
  const resetAllPrompts = () => {
    setPrompts(DEFAULT_PROMPTS)
  }
  
  const getPrompt = (id: string): PromptTemplate | undefined => {
    return (prompts || DEFAULT_PROMPTS).find(p => p.id === id)
  }
  
  return {
    prompts: prompts || DEFAULT_PROMPTS,
    updatePrompt,
    resetPrompt,
    resetAllPrompts,
    getPrompt
  }
}
