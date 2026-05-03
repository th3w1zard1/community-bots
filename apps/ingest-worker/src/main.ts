import { createHash } from "node:crypto";

import FirecrawlApp from "@mendable/firecrawl-js";
import { loadIngestWorkerConfig } from "@openkotor/config";
import { createLogger } from "@openkotor/core";
import {
  FileReindexQueueStore,
  FileChunkStore,
  createDefaultSearchProvider,
  type ChunkRecord,
  type SourceDescriptor,
  type SourceIndexRecord,
} from "@openkotor/retrieval";

const logger = createLogger("ingest-worker");
const config = loadIngestWorkerConfig();
const searchProvider = createDefaultSearchProvider({ stateDir: config.stateDir });
const chunkStore = new FileChunkStore(config.stateDir);
const reindexQueue = new FileReindexQueueStore(config.stateDir);

const firecrawl = config.ai.firecrawlApiKey
  ? new FirecrawlApp({ apiKey: config.ai.firecrawlApiKey })
  : undefined;

// ---------------------------------------------------------------------------
// HTML to plain text fallback (used when Firecrawl is not configured)
// ---------------------------------------------------------------------------

const stripHtml = (html: string): string => {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return text.replace(/\s+/g, " ").trim();
};

const chunkByWords = (text: string, wordsPerChunk = 500): string[] => {
  const words = text.split(" ").filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  return chunks;
};

const fetchSourceTextViaRawHttp = async (source: SourceDescriptor): Promise<string> => {
  const response = await fetch(source.homeUrl, {
    headers: { "User-Agent": "openkotor-ingest-worker/0.1" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${source.homeUrl}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  return contentType.includes("html") ? stripHtml(body) : body;
};

// ---------------------------------------------------------------------------
// Fetch and index a single source
// ---------------------------------------------------------------------------

const fetchAndIndexSource = async (source: SourceDescriptor): Promise<number> => {
  let plainText: string;

  if (firecrawl) {
    try {
      const result = await firecrawl.scrape(source.homeUrl, { formats: ["markdown"] });

      if (!result.markdown) {
        throw new Error(`Firecrawl scrape returned no markdown for ${source.homeUrl}`);
      }

      plainText = result.markdown;
      logger.info(`Firecrawl scraped ${source.id}.`, { url: source.homeUrl, chars: plainText.length });
    } catch (error) {
      logger.warn("Firecrawl scrape failed, falling back to raw fetch.", {
        sourceId: source.id,
        error: error instanceof Error ? error.message : String(error),
      });
      plainText = await fetchSourceTextViaRawHttp(source);
    }
  } else {
    logger.warn("FIRECRAWL_API_KEY not set — falling back to raw fetch.", { sourceId: source.id });
    plainText = await fetchSourceTextViaRawHttp(source);
  }

  const textChunks = chunkByWords(plainText);
  const fetchedAt = Date.now();

  for (let i = 0; i < textChunks.length; i++) {
    const chunkText = textChunks[i]!;
    const id = createHash("sha1")
      .update(`${source.id}:${i}:${fetchedAt}`)
      .digest("hex")
      .slice(0, 12);

    const chunk: ChunkRecord = {
      id,
      sourceId: source.id,
      sourceName: source.name,
      kind: source.kind,
      url: source.homeUrl,
      title: source.name,
      chunkText,
      fetchedAt,
      chunkIndex: i,
      tags: [...source.tags],
    };

    await chunkStore.saveChunk(chunk);
  }

  await chunkStore.saveSourceIndex({
    sourceId: source.id,
    sourceName: source.name,
    kind: source.kind,
    url: source.homeUrl,
    chunkCount: textChunks.length,
    lastFetchedAt: fetchedAt,
    tags: [...source.tags],
  } satisfies SourceIndexRecord);

  return textChunks.length;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_QUEUE_POLL_MS = 15_000;
const MIN_QUEUE_POLL_MS = 1_000;
const MAX_QUEUE_POLL_MS = 5 * 60_000;

const parseQueuePollMs = (rawValue: string | undefined): number => {
  if (!rawValue) return DEFAULT_QUEUE_POLL_MS;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) return DEFAULT_QUEUE_POLL_MS;
  return Math.max(MIN_QUEUE_POLL_MS, Math.min(MAX_QUEUE_POLL_MS, parsed));
};

const runReindexTargets = async (
  targets: readonly SourceDescriptor[],
): Promise<{ sourceId: string; chunks: number; error?: string }[]> => {
  const results: { sourceId: string; chunks: number; error?: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const source = targets[i]!;
    if (i > 0) {
      await sleep(1_000);
    }

    try {
      const chunks = await fetchAndIndexSource(source);
      logger.info(`Indexed ${source.id}: ${chunks} chunk(s).`);
      results.push({ sourceId: source.id, chunks });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to index ${source.id}.`, { error });
      results.push({ sourceId: source.id, chunks: 0, error });
    }
  }

  return results;
};

const drainQueueOnce = async (): Promise<{ total: number; succeeded: number; failed: number; skipped: number }> => {
  const queuedSourceIds = await reindexQueue.dequeueAll();

  if (queuedSourceIds.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const allSources = await searchProvider.listSources();
  const knownIds = new Set(allSources.map((source) => source.id));
  const uniqueQueuedIds = [...new Set(queuedSourceIds)];
  const missingSourceIds = uniqueQueuedIds.filter((sourceId) => !knownIds.has(sourceId));
  const targets = allSources.filter((source) => uniqueQueuedIds.includes(source.id));

  if (targets.length === 0) {
    logger.warn("Queued jobs did not match any known sources.", {
      queuedSourceIds: uniqueQueuedIds,
      missingSourceIds,
    });
    return { total: uniqueQueuedIds.length, succeeded: 0, failed: 0, skipped: uniqueQueuedIds.length };
  }

  if (missingSourceIds.length > 0) {
    logger.warn("Some queued jobs referenced unknown source ids and were skipped.", { missingSourceIds });
  }

  logger.info(`Draining ${targets.length} queued source refresh job(s).`, {
    stateDir: config.stateDir,
  });

  const results = await runReindexTargets(targets);
  const failedSourceIds = results.filter((result) => result.error).map((result) => result.sourceId);

  if (failedSourceIds.length > 0) {
    await reindexQueue.enqueue(failedSourceIds);
    logger.warn("Re-queued failed source refresh jobs.", { failedSourceIds });
  }

  const succeeded = results.filter((result) => !result.error).length;
  const failed = failedSourceIds.length;
  const skipped = missingSourceIds.length;
  return { total: uniqueQueuedIds.length, succeeded, failed, skipped };
};

const [command, ...rest] = process.argv.slice(2);

switch (command ?? "list-sources") {
  case "list-sources": {
    const sources = await searchProvider.listSources();

    console.table(
      sources.map((source) => ({
        id: source.id,
        kind: source.kind,
        name: source.name,
        freshness: source.freshnessPolicy,
      })),
    );

    logger.info("Source catalog listed.", {
      sourceCount: sources.length,
      stateDir: config.stateDir,
    });
    break;
  }

  case "queue-reindex": {
    const result = await searchProvider.queueReindex(rest.length > 0 ? rest : undefined);

    if (result.queuedSourceIds.length === 0) {
      logger.warn("No matching sources found for reindex.", { requested: rest });
      break;
    }

    logger.info(`Queued ${result.queuedSourceIds.length} source refresh job(s).`, {
      stateDir: config.stateDir,
      queuedSourceIds: result.queuedSourceIds,
      mode: result.mode,
    });

    break;
  }

  case "reindex-now": {
    const allSources = await searchProvider.listSources();
    const targetIds = new Set(rest.length > 0 ? rest : allSources.map((s) => s.id));
    const targets = allSources.filter((s) => targetIds.has(s.id));

    if (targets.length === 0) {
      logger.warn("No matching sources found for immediate reindex.", { requested: rest });
      break;
    }

    logger.info(`Starting immediate reindex of ${targets.length} source(s).`, {
      stateDir: config.stateDir,
    });

    const results = await runReindexTargets(targets);

    const succeeded = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;
    logger.info("Immediate reindex complete.", { succeeded, failed, total: targets.length });
    break;
  }

  case "drain-queue": {
    const outcome = await drainQueueOnce();

    if (outcome.total === 0) {
      logger.info("No queued source refresh jobs were found.", { stateDir: config.stateDir });
      break;
    }
    logger.info("Queue drain complete.", outcome);
    break;
  }

  case "run-queue-worker": {
    const pollMs = parseQueuePollMs(rest[0]);
    logger.info("Starting queue worker.", {
      stateDir: config.stateDir,
      pollMs,
    });

    for (;;) {
      const outcome = await drainQueueOnce();
      if (outcome.total > 0) {
        logger.info("Queue worker cycle complete.", outcome);
      }
      await sleep(pollMs);
    }

    break;
  }

  case "show-indexed": {
    const indexes = await chunkStore.loadAllSourceIndexes();

    if (indexes.length === 0) {
      logger.info("No sources have been indexed yet.", { stateDir: config.stateDir });
      break;
    }

    console.table(
      indexes
        .sort((a, b) => b.lastFetchedAt - a.lastFetchedAt)
        .map((idx) => ({
          id: idx.sourceId,
          name: idx.sourceName,
          chunks: idx.chunkCount,
          lastFetched: new Date(idx.lastFetchedAt).toISOString(),
        })),
    );

    logger.info("Indexed sources listed.", {
      sourceCount: indexes.length,
      totalChunks: indexes.reduce((sum, idx) => sum + idx.chunkCount, 0),
    });
    break;
  }

  case "show-config": {
    logger.info("Ingest worker bootstrap config.", {
      stateDir: config.stateDir,
      hasOpenAiKey: Boolean(config.ai.openAiApiKey),
      hasFirecrawlKey: Boolean(config.ai.firecrawlApiKey),
      chatModel: config.ai.chatModel,
      embeddingModel: config.ai.embeddingModel,
      databaseConfigured: Boolean(config.ai.databaseUrl),
    });
    break;
  }

  default: {
    logger.warn("Unknown ingest-worker command.", {
      received: command,
      usage: [
        "list-sources",
        "queue-reindex [sourceIds...]",
        "reindex-now [sourceIds...]",
        "drain-queue",
        "run-queue-worker [pollMs]",
        "show-indexed",
        "show-config",
      ],
    });
  }
}