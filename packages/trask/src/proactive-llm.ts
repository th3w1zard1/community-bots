import OpenAI from "openai";

import type { SharedAiConfig } from "@openkotor/config";

import { splitResearchAnswer } from "./discord-reply-format.js";

export const cosineSimilarity = (a: readonly number[], b: readonly number[]): number => {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let na = 0;
  let nb = 0;

  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }

  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
};

export interface TraskProactiveClassification {
  readonly isQuestion: boolean;
  readonly kotorRelevant: boolean;
  readonly confidence: number;
}

/** Raw LLM JSON object; fields may arrive as strings or booleans depending on provider. */
interface ClassificationJson {
  readonly is_question?: string | number | boolean | null;
  readonly kotor_relevant?: string | number | boolean | null;
  readonly confidence?: string | number | boolean | null;
}

const parseClassificationJson = (raw: string): TraskProactiveClassification | null => {
  try {
    const parsed = JSON.parse(raw) as ClassificationJson;

    const isQuestion = Boolean(parsed.is_question);
    const kotorRelevant = Boolean(parsed.kotor_relevant);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence);

    if (!Number.isFinite(confidence)) {
      return null;
    }

    return {
      isQuestion,
      kotorRelevant,
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  } catch {
    return null;
  }
};

export const classifyTraskProactiveMessage = async (
  client: OpenAI,
  model: string,
  content: string,
): Promise<TraskProactiveClassification | null> => {
  const trimmed = content.trim().slice(0, 500);

  const run = async (jsonMode: boolean): Promise<TraskProactiveClassification | null> => {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: [
            "You classify Discord chat lines for a Star Wars: Knights of the Old Republic (KOTOR 1/2) modding help bot.",
            'Return ONLY JSON: {"is_question":boolean,"kotor_relevant":boolean,"confidence":number}',
            "is_question: the user is seeking information/help (what/how/why/whether), troubleshooting, or mod/tool guidance — not mere greetings, jokes, or unrelated chatter.",
            "kotor_relevant: about KOTOR/TSL, modding, saves, compatibility, Deadly Stream/PyKotor/MDLOps-class tooling tied to these games.",
            "confidence: 0-1 for both judgments combined.",
          ].join("\n"),
        },
        { role: "user", content: trimmed },
      ],
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return null;
    }

    return parseClassificationJson(raw);
  };

  try {
    const withMode = await run(true);
    if (withMode) {
      return withMode;
    }
  } catch {
    // Provider may not support JSON mode for this model — retry without it.
  }

  try {
    return await run(false);
  } catch {
    return null;
  }
};

export interface ResearchAlignmentInput {
  readonly question: string;
  readonly answerMarkdown: string;
  readonly researchReport: string;
}

/** Embedding similarity between question/answer and the research report (max of the two cosines). */
export const scoreResearchAlignment = async (
  client: OpenAI,
  embeddingModel: string,
  input: ResearchAlignmentInput,
): Promise<number> => {
  const { body } = splitResearchAnswer(input.answerMarkdown);
  const q = input.question.trim().slice(0, 2000);
  const a = body.trim().slice(0, 2000);
  const r = input.researchReport.trim().slice(0, 12000);

  const response = await client.embeddings.create({
    model: embeddingModel,
    input: [q, a, r],
  });

  const vectors = response.data
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.embedding);

  const eq = vectors[0];
  const ea = vectors[1];
  const er = vectors[2];

  if (!eq || !ea || !er) {
    return 0;
  }

  return Math.max(cosineSimilarity(eq, er), cosineSimilarity(ea, er));
};

export const createOpenAiClient = (ai: SharedAiConfig): OpenAI | null => {
  if (!ai.openAiApiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: ai.openAiApiKey,
    ...(ai.openAiBaseUrl ? { baseURL: ai.openAiBaseUrl } : {}),
    ...(ai.openAiDefaultHeaders ? { defaultHeaders: ai.openAiDefaultHeaders } : {}),
  });
};
