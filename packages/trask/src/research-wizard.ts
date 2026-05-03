import OpenAI from "openai";

import { loadSharedAiConfig, type ResearchWizardRuntimeConfig, type SharedAiConfig } from "@openkotor/config";
import { traskApprovedResearchSources, type SourceDescriptor } from "@openkotor/retrieval";

import { runHeadlessGptResearcher } from "./gpt-researcher-subprocess.js";

export interface ResearchWizardAnswer {
  answer: string;
  approvedSources: readonly SourceDescriptor[];
}

export interface ResearchWizardBriefAnswer extends ResearchWizardAnswer {
  /** Normalized research report text used for proactive semantic gating. */
  researchReport: string;
}

/** Fine-grained phases for Holocron clients polling thread history. */
export interface ResearchWizardProgressEvent {
  phase: "gather" | "report" | "sources" | "compose";
  detail?: string;
  sources?: readonly SourceDescriptor[];
}

/** Structural type for adapters that only need full Q&A (e.g. Trask HTTP `/ask`). */
export interface ResearchWizardQueryHandler {
  answerQuestion(
    query: string,
    onProgress?: (event: ResearchWizardProgressEvent) => void,
  ): Promise<ResearchWizardAnswer>;
}

interface ResearchWizardResponsePayload {
  report?: string | null;
  research_information?: {
    source_urls?: readonly string[] | null;
    visited_urls?: readonly string[] | null;
  };
}

const buildResearchTask = (query: string): string => {
  return query.trim();
};

const buildCustomPrompt = (): string => {
  return [
    "Answer the user's question as a Discord-native KOTOR assistant reply using only the provided research context.",
    "Requirements:",
    "- Lead with the answer, not an introduction.",
    "- Sound direct, practical, and helpful.",
    "- Keep the answer concise: at most 3 short paragraphs or 5 compact bullets total before sources.",
    "- Do not describe your research process, retrieval steps, indexing, backend systems, or source policy unless the user explicitly asks.",
    "- Include inline numeric citations like [1] tied to concrete claims.",
    ' - End with the exact heading "Sources" on its own line.',
    "- Under Sources, list only the sources you cited, each on its own numbered line in the format: 1. Source Name - URL",
    "- Do not add markdown headings other than the final Sources heading.",
  ].join("\n");
};

const buildCustomPromptBrief = (): string => {
  return [
    "Produce a compact research digest for Star Wars: Knights of the Old Republic (KOTOR 1/2) modding questions.",
    "Constraints:",
    "- Stay under ~900 words; bullet key facts when possible.",
    "- Do not narrate tooling, retrieval steps, or how you searched.",
    "- Prefer actionable answers over background essays.",
    "- Include inline numeric citations like [1] tied to concrete claims.",
    ' - End with the exact heading "Sources" on its own line.',
    "- Under Sources, list only cited sources as numbered lines: 1. Source Name - URL",
  ].join("\n");
};

const normalizeUrl = (value: string): string => value.replace(/\/+$/, "").trim();

const extractUrls = (value: string): string[] => {
  const matches = value.match(/https?:\/\/[^\s)>\]]+/g) ?? [];
  return [...new Set(matches.map((match) => match.replace(/[.,;:!?]+$/, "")))];
};

const hostnameHint = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.slice(0, 48);
  }
};

/** Dedupe by normalized URL; preserves first-seen order for stable Holocron pulses. */
const uniqueUrlsPreserveOrder = (urls: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const u = normalizeUrl(raw);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
};

/** Visited / cited URLs from GPT Researcher payload (Holocron live facet pings). */
const collectVisitedUrlsFromPayload = (payload: ResearchWizardResponsePayload): string[] => {
  const info = payload.research_information;
  const rawVisited =
    (Array.isArray(info?.visited_urls) ? info.visited_urls : []).filter(
      (value): value is string => typeof value === "string",
    );
  const rawSources =
    (Array.isArray(info?.source_urls) ? info.source_urls : []).filter((value): value is string => typeof value === "string");
  return uniqueUrlsPreserveOrder([...rawVisited, ...rawSources]);
};

const MAX_ARCHIVE_PROBE_EVENTS = 28;

const emitArchiveProbeEvents = (
  payload: ResearchWizardResponsePayload,
  approvedSources: readonly SourceDescriptor[],
  onProgress?: (event: ResearchWizardProgressEvent) => void,
): void => {
  if (!onProgress) return;

  const urls = collectVisitedUrlsFromPayload(payload).slice(0, MAX_ARCHIVE_PROBE_EVENTS * 2);

  let emitted = 0;
  for (const url of urls) {
    if (emitted >= MAX_ARCHIVE_PROBE_EVENTS) break;
    const matched = matchApprovedSource(url, approvedSources);
    const host = hostnameHint(url);
    onProgress({
      phase: "gather",
      detail: matched ? `Facet · ${matched.name}` : `Touch · ${host}`,
      ...(matched ? { sources: [matched] } : {}),
    });
    emitted++;
  }
};

const matchApprovedSource = (
  url: string,
  approvedSources: readonly SourceDescriptor[],
): SourceDescriptor | undefined => {
  const candidate = normalizeUrl(url);

  return approvedSources.find((source) => {
    const homeUrl = normalizeUrl(source.homeUrl);
    return candidate === homeUrl || candidate.startsWith(`${homeUrl}/`);
  });
};

const sourceMentionedInReport = (report: string, source: SourceDescriptor): boolean => {
  const normalizedReport = report.toLowerCase();
  const normalizedSourceName = source.name.toLowerCase().trim();

  if (normalizedSourceName.length >= 4 && normalizedReport.includes(normalizedSourceName)) {
    return true;
  }

  try {
    const hostname = new URL(source.homeUrl).hostname.replace(/^www\./, "").toLowerCase();
    return hostname.length > 0 && normalizedReport.includes(hostname);
  } catch {
    return false;
  }
};

const collectRelevantSources = (
  report: string,
  approvedSources: readonly SourceDescriptor[],
  payload: ResearchWizardResponsePayload,
): readonly SourceDescriptor[] => {
  const candidateUrls = [
    ...extractUrls(report),
    ...((Array.isArray(payload.research_information?.source_urls) ? payload.research_information.source_urls : [])
      .filter((value): value is string => typeof value === "string")),
    ...((Array.isArray(payload.research_information?.visited_urls) ? payload.research_information.visited_urls : [])
      .filter((value): value is string => typeof value === "string")),
  ];

  const matched: SourceDescriptor[] = [];

  for (const url of candidateUrls) {
    const source = matchApprovedSource(url, approvedSources);

    if (source && !matched.some((entry) => entry.id === source.id)) {
      matched.push(source);
    }
  }

  for (const source of approvedSources) {
    if (sourceMentionedInReport(report, source) && !matched.some((entry) => entry.id === source.id)) {
      matched.push(source);
    }
  }

  return matched;
};

const normalizeReport = (value: string): string => {
  return value
    .replace(/^#\s+.*$/m, "")
    .replace(/^##\s+Table of Contents[\s\S]*?(?=^##\s+|^Sources\s*$|^#\s+|$)/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const formatSourcesSection = (sources: readonly SourceDescriptor[]): string => {
  return [
    "Sources",
    ...sources.map((source, index) => `${index + 1}. ${source.name} - ${source.homeUrl}`),
  ].join("\n");
};

const fallbackDiscordRewrite = (
  report: string,
  sources: readonly SourceDescriptor[],
): string => {
  const sourceIndexByUrl = new Map<string, number>(
    sources.map((source, index) => [normalizeUrl(source.homeUrl), index + 1]),
  );

  const [bodyOnlyCandidate = ""] = normalizeReport(report).split(/\n(?:#{1,6}\s*)?(?:Sources|References)\s*\n/i, 1);
  const bodyOnly = bodyOnlyCandidate
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_match, text: string, url: string) => {
      const matchedSource = matchApprovedSource(url, sources);
      const citationIndex = matchedSource ? sourceIndexByUrl.get(normalizeUrl(matchedSource.homeUrl)) : undefined;
      return citationIndex ? `${text} [${citationIndex}]` : text;
    })
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/^\|.*\|$/gm, "")
    .replace(/\*+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paragraphs = bodyOnly
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const selected: string[] = [];
  let totalLength = 0;

  for (const paragraph of paragraphs) {
    if (selected.length >= 2) break;
    if (totalLength + paragraph.length > 900 && selected.length > 0) break;
    selected.push(paragraph);
    totalLength += paragraph.length;
  }

  let summary = selected.join("\n\n").trim();

  if (!summary) {
    summary = bodyOnly.slice(0, 900).trim();
  }

  if (sources.length > 0 && !/\[\d+\]/.test(summary)) {
    summary = `${summary} [1]`.trim();
  }

  return `${summary}\n\n${formatSourcesSection(sources)}`;
};

const fallbackDiscordBrief = (report: string, sources: readonly SourceDescriptor[]): string => {
  const sourceIndexByUrl = new Map<string, number>(
    sources.map((source, index) => [normalizeUrl(source.homeUrl), index + 1]),
  );

  const [bodyOnlyCandidate = ""] = normalizeReport(report).split(/\n(?:#{1,6}\s*)?(?:Sources|References)\s*\n/i, 1);
  const bodyOnly = bodyOnlyCandidate
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_match, text: string, url: string) => {
      const matchedSource = matchApprovedSource(url, sources);
      const citationIndex = matchedSource ? sourceIndexByUrl.get(normalizeUrl(matchedSource.homeUrl)) : undefined;
      return citationIndex ? `${text} [${citationIndex}]` : text;
    })
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/\*+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const firstChunk = bodyOnly.split(/\n{2,}/)[0]?.trim() ?? bodyOnly;
  let summary = firstChunk.slice(0, 420).trim();

  if (!summary) {
    summary = bodyOnly.slice(0, 420).trim();
  }

  if (sources.length > 0 && !/\[\d+\]/.test(summary)) {
    summary = `${summary} [1]`.trim();
  }

  return `${summary}\n\n${formatSourcesSection(sources)}`;
};

export class ResearchWizardClient implements ResearchWizardQueryHandler {
  private readonly openAiClient: OpenAI | null;

  public constructor(
    private readonly config: ResearchWizardRuntimeConfig,
    private readonly aiConfig: SharedAiConfig,
    private readonly approvedSources: readonly SourceDescriptor[] = traskApprovedResearchSources,
  ) {
    this.openAiClient = aiConfig.openAiApiKey
      ? new OpenAI({
          apiKey: aiConfig.openAiApiKey,
          ...(aiConfig.openAiBaseUrl ? { baseURL: aiConfig.openAiBaseUrl } : {}),
          ...(aiConfig.openAiDefaultHeaders ? { defaultHeaders: aiConfig.openAiDefaultHeaders } : {}),
        })
      : null;
  }

  private async rewriteForDiscord(
    query: string,
    report: string,
    approvedSources: readonly SourceDescriptor[],
  ): Promise<string> {
    if (!this.openAiClient) {
      return fallbackDiscordRewrite(report, approvedSources);
    }

    const allowedSources = approvedSources
      .map((source, index) => `${index + 1}. ${source.name} - ${source.homeUrl}`)
      .join("\n");

    const modelsToTry = [...new Set([this.aiConfig.chatModel, ...this.aiConfig.chatModelFallbacks])];

    for (const model of modelsToTry) {
      try {
        const completion = await this.openAiClient.chat.completions.create({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: [
                "Rewrite research reports into concise Discord answers.",
                "Do not mention research steps, indexing, tooling, or backend behavior.",
                "Use only the numbered sources provided by the user.",
                "Return plain Markdown with no headings except the final Sources heading.",
              ].join(" "),
            },
            {
              role: "user",
              content: [
                `Question: ${query}`,
                "Write a concise answer for Discord.",
                "Requirements:",
                "- Lead with the answer.",
                "- Use at most 3 short paragraphs or 5 compact bullets before sources.",
                "- Use inline numeric citations like [1], [2].",
                ' - End with the exact heading "Sources" on its own line.',
                "- Under Sources, include only the cited sources using the exact numbered lines provided below.",
                "Allowed Sources:",
                allowedSources,
                "Research Report:",
                report,
              ].join("\n\n"),
            },
          ],
        });

        const rewritten = completion.choices[0]?.message?.content?.trim();

        if (rewritten && /\nSources\s*\n/i.test(rewritten)) {
          return rewritten;
        }
      } catch {
        continue;
      }
    }

    return fallbackDiscordRewrite(report, approvedSources);
  }

  private async rewriteForDiscordBrief(
    query: string,
    report: string,
    approvedSources: readonly SourceDescriptor[],
  ): Promise<string> {
    if (!this.openAiClient) {
      return fallbackDiscordBrief(report, approvedSources);
    }

    const allowedSources = approvedSources
      .map((source, index) => `${index + 1}. ${source.name} - ${source.homeUrl}`)
      .join("\n");

    const modelsToTry = [...new Set([this.aiConfig.chatModel, ...this.aiConfig.chatModelFallbacks])];

    for (const model of modelsToTry) {
      try {
        const completion = await this.openAiClient.chat.completions.create({
          model,
          temperature: 0.15,
          max_tokens: 380,
          messages: [
            {
              role: "system",
              content: [
                "Rewrite research into a very short Discord chat reply (like a quick DM).",
                "No preamble, no essay tone, no meta commentary about research.",
                "Use only the numbered sources provided.",
                "Plain sentences; at most 2 short sentences OR up to 3 compact bullets before Sources.",
                'End with the exact heading "Sources" on its own line, then cited sources only.',
              ].join(" "),
            },
            {
              role: "user",
              content: [
                `Question: ${query}`,
                "Write the shortest helpful answer.",
                "Allowed Sources:",
                allowedSources,
                "Research Report:",
                report,
              ].join("\n\n"),
            },
          ],
        });

        const rewritten = completion.choices[0]?.message?.content?.trim();

        if (rewritten && /\nSources\s*\n/i.test(rewritten)) {
          return rewritten;
        }
      } catch {
        continue;
      }
    }

    return fallbackDiscordBrief(report, approvedSources);
  }

  private async fetchResearchReport(
    query: string,
    customPrompt: string,
  ): Promise<{ report: string; payload: ResearchWizardResponsePayload }> {
    const raw = await runHeadlessGptResearcher(this.config, {
      query: buildResearchTask(query),
      custom_prompt: customPrompt,
      source_urls: this.approvedSources.map((source) => source.homeUrl),
      query_domains: this.approvedSources.map((source) => new URL(source.homeUrl).hostname),
      report_type: "research_report",
      report_source: "web",
    });

    const payload: ResearchWizardResponsePayload = {
      report: raw.report,
      ...(raw.research_information !== undefined
        ? { research_information: { ...raw.research_information } }
        : {}),
    };

    const report = typeof raw.report === "string" ? normalizeReport(raw.report) : "";

    if (!report) {
      throw new Error("GPT Researcher returned an empty report.");
    }

    return { report, payload };
  }

  public async answerQuestion(
    query: string,
    onProgress?: (event: ResearchWizardProgressEvent) => void,
  ): Promise<ResearchWizardAnswer> {
    onProgress?.({
      phase: "gather",
      detail: "Scanning approved archives and open-web context…",
    });
    const { report, payload } = await this.fetchResearchReport(query, buildCustomPrompt());
    emitArchiveProbeEvents(payload, this.approvedSources, onProgress);
    onProgress?.({
      phase: "report",
      detail: "Ranking passages and citations…",
    });
    const relevantSources = collectRelevantSources(report, this.approvedSources, payload);
    onProgress?.({
      phase: "sources",
      detail: relevantSources.length ? `${relevantSources.length} sources matched` : "Mapping hosts to archive catalog…",
      sources: relevantSources,
    });
    onProgress?.({
      phase: "compose",
      detail: "Rendering Holocron answer…",
    });
    const answer = await this.rewriteForDiscord(query, report, relevantSources);

    return {
      answer,
      approvedSources: relevantSources,
    };
  }

  /** Shorter rewrite for proactive/channel replies (still source-backed). */
  public async answerQuestionBrief(query: string): Promise<ResearchWizardBriefAnswer> {
    const { report, payload } = await this.fetchResearchReport(query, buildCustomPromptBrief());
    const relevantSources = collectRelevantSources(report, this.approvedSources, payload);
    const answer = await this.rewriteForDiscordBrief(query, report, relevantSources);

    return {
      answer,
      approvedSources: relevantSources,
      researchReport: report,
    };
  }
}

export const createResearchWizardClient = (
  config: ResearchWizardRuntimeConfig,
  aiConfig: SharedAiConfig = loadSharedAiConfig(),
): ResearchWizardClient => {
  return new ResearchWizardClient(config, aiConfig);
};
