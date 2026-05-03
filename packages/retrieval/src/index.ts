import { mkdir, open, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

export type SourceKind = "website" | "github" | "discord";

export interface SourceDescriptor {
  id: string;
  name: string;
  kind: SourceKind;
  homeUrl: string;
  description: string;
  freshnessPolicy: string;
  approvalScope: string;
  tags: readonly string[];
}

export interface SearchHit {
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  title: string;
  snippet: string;
  url: string;
  score: number;
  tags: readonly string[];
}

export interface SearchProvider {
  listSources(): Promise<readonly SourceDescriptor[]>;
  search(query: string, limit?: number): Promise<readonly SearchHit[]>;
  queueReindex(sourceIds?: readonly string[]): Promise<{ queuedSourceIds: readonly string[]; mode: "file-queue" }>;
}

interface ReindexQueueState {
  version: 1;
  queuedSourceIds: string[];
}

const emptyReindexQueueState = (): ReindexQueueState => ({
  version: 1,
  queuedSourceIds: [],
});

export class FileReindexQueueStore {
  private static readonly LOCK_TIMEOUT_MS = 5_000;
  private static readonly LOCK_RETRY_MS = 50;
  private static readonly LOCK_STALE_MS = 5 * 60_000;
  private static readonly LOCK_HEARTBEAT_MS = 30_000;

  public constructor(private readonly stateDir: string) {}

  private queueFilePath(): string {
    return path.join(this.stateDir, "reindex-queue.json");
  }

  private queueLockPath(): string {
    return path.join(this.stateDir, "reindex-queue.lock");
  }

  private async withQueueLock<T>(work: () => Promise<T>): Promise<T> {
    await mkdir(this.stateDir, { recursive: true });
    const lockPath = this.queueLockPath();
    const deadline = Date.now() + FileReindexQueueStore.LOCK_TIMEOUT_MS;

    for (;;) {
      try {
        const lockHandle = await open(lockPath, "wx");
        const heartbeat = setInterval(() => {
          const now = new Date();
          void utimes(lockPath, now, now).catch(() => {
            // Ignore heartbeat failures; lock release/timeout handling remains authoritative.
          });
        }, FileReindexQueueStore.LOCK_HEARTBEAT_MS);
        heartbeat.unref?.();

        try {
          return await work();
        } finally {
          clearInterval(heartbeat);
          await lockHandle.close();
          await rm(lockPath, { force: true });
        }
      } catch (error) {
        const isLockContention =
          typeof error === "object"
          && error !== null
          && "code" in error
          && (error as { code?: string }).code === "EEXIST";

        if (!isLockContention) {
          throw error;
        }

        try {
          const lockStats = await stat(lockPath);
          const lockAgeMs = Date.now() - lockStats.mtimeMs;
          if (lockAgeMs >= FileReindexQueueStore.LOCK_STALE_MS) {
            await rm(lockPath, { force: true });
            continue;
          }
        } catch {
          // Lock disappeared between contention and inspection; just retry.
        }

        if (Date.now() >= deadline) {
          throw new Error("Timed out waiting for reindex queue lock.");
        }

        await new Promise((resolve) => setTimeout(resolve, FileReindexQueueStore.LOCK_RETRY_MS));
      }
    }
  }

  private async loadState(): Promise<ReindexQueueState> {
    const queuePath = this.queueFilePath();
    let raw: string;

    try {
      raw = await readFile(queuePath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === "ENOENT") {
        return emptyReindexQueueState();
      }
      throw error;
    }

    let parsed: Partial<ReindexQueueState>;
    try {
      parsed = JSON.parse(raw) as Partial<ReindexQueueState>;
    } catch {
      const quarantinePath = `${queuePath}.corrupt.${Date.now()}`;
      await rename(queuePath, quarantinePath);
      return emptyReindexQueueState();
    }

    if (parsed.version !== 1 || !Array.isArray(parsed.queuedSourceIds)) {
      const quarantinePath = `${queuePath}.corrupt.${Date.now()}`;
      await rename(queuePath, quarantinePath);
      return emptyReindexQueueState();
    }

    return {
      version: 1,
      queuedSourceIds: parsed.queuedSourceIds
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0),
    };
  }

  private async saveState(state: ReindexQueueState): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
    const queuePath = this.queueFilePath();
    const tempPath = `${queuePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, queuePath);
  }

  public async enqueue(sourceIds: readonly string[]): Promise<readonly string[]> {
    const normalizedIds = [...new Set(sourceIds.map((sourceId) => sourceId.trim()).filter((sourceId) => sourceId.length > 0))];
    await this.withQueueLock(async () => {
      const state = await this.loadState();
      const queued = [...state.queuedSourceIds];
      const queuedSet = new Set(queued);

      for (const sourceId of normalizedIds) {
        if (!queuedSet.has(sourceId)) {
          queued.push(sourceId);
          queuedSet.add(sourceId);
        }
      }

      await this.saveState({
        version: 1,
        queuedSourceIds: queued,
      });
    });

    return normalizedIds;
  }

  public async dequeueAll(): Promise<readonly string[]> {
    return this.withQueueLock(async () => {
      const state = await this.loadState();
      const queued = [...state.queuedSourceIds];

      await this.saveState(emptyReindexQueueState());
      return queued;
    });
  }
}

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .split(/[^a-z0-9.+-]+/)
    .filter(Boolean);
};

export const defaultSourceCatalog: readonly SourceDescriptor[] = [
  {
    id: "deadlystream",
    name: "Deadly Stream",
    kind: "website",
    homeUrl: "https://deadlystream.com",
    description: "Primary KOTOR modding hub for releases, forum threads, and troubleshooting context.",
    freshnessPolicy: "daily metadata sync plus on-demand scrape for cited pages",
    approvalScope: "public modding resources",
    tags: ["mods", "forum", "support", "tslrcm"],
  },
  {
    id: "lucasforums-archive",
    name: "LucasForums Archive",
    kind: "website",
    homeUrl: "https://lucasforumsarchive.com",
    description: "Archived historical forum discussions from the original KOTOR community.",
    freshnessPolicy: "static archive snapshot with selective recrawl",
    approvalScope: "public archived discussions",
    tags: ["archive", "history", "modding", "forums"],
  },
  {
    id: "pcgamingwiki-kotor",
    name: "PCGamingWiki",
    kind: "website",
    homeUrl: "https://www.pcgamingwiki.com/wiki/Star_Wars:_Knights_of_the_Old_Republic",
    description: "Technical compatibility notes, fixes, and platform troubleshooting for KOTOR and TSL.",
    freshnessPolicy: "daily if referenced often, otherwise weekly",
    approvalScope: "public technical reference",
    tags: ["troubleshooting", "pc", "compatibility", "fixes"],
  },
  {
    id: "kotor-neocities",
    name: "KOTOR Neocities",
    kind: "website",
    homeUrl: "https://kotor.neocities.org",
    description: "Community-maintained technical notes and compact guides for KOTOR tooling and formats.",
    freshnessPolicy: "weekly crawl with manual pinning for key pages",
    approvalScope: "public documentation",
    tags: ["reference", "formats", "guides", "tooling"],
  },
  {
    id: "pykotor-wiki",
    name: "PyKotor Wiki",
    kind: "website",
    homeUrl: "https://github.com/NickHugi/PyKotor/wiki",
    description: "PyKotor-specific reference material for scripting, formats, and automation workflows.",
    freshnessPolicy: "pull wiki pages on demand when cited",
    approvalScope: "public project wiki",
    tags: ["pykotor", "python", "formats", "automation"],
  },
  {
    id: "reone-repo",
    name: "reone",
    kind: "github",
    homeUrl: "https://github.com/reone/reone",
    description: "Open-source engine reimplementation relevant to modern KOTOR runtime behavior discussions.",
    freshnessPolicy: "index tagged releases and main branch snapshots",
    approvalScope: "public source code",
    tags: ["engine", "reimplementation", "reone", "c++"],
  },
  {
    id: "northernlights-repo",
    name: "Northern Lights",
    kind: "github",
    homeUrl: "https://github.com/NickHugi/NorthernLights",
    description: "Engine and tooling work related to KOTOR data and rendering behavior.",
    freshnessPolicy: "main branch snapshots plus release tags",
    approvalScope: "public source code",
    tags: ["engine", "rendering", "northernlights", "tooling"],
  },
  {
    id: "mdlops-repo",
    name: "MDLOps",
    kind: "github",
    homeUrl: "https://github.com/bead-v/mdlops",
    description: "Model conversion and asset pipeline tooling for KOTOR models.",
    freshnessPolicy: "weekly source sync",
    approvalScope: "public source code",
    tags: ["mdlops", "models", "assets", "conversion"],
  },
  {
    id: "pykotor-repo",
    name: "PyKotor",
    kind: "github",
    homeUrl: "https://github.com/NickHugi/PyKotor",
    description: "Python library for KOTOR formats and automation, useful for scripts and data extraction.",
    freshnessPolicy: "main branch sync with issue-linked refreshes",
    approvalScope: "public source code",
    tags: ["pykotor", "python", "library", "formats"],
  },
  {
    id: "kotorjs-repo",
    name: "kotor.js",
    kind: "github",
    homeUrl: "https://github.com/KobaltBlu/KotOR.js",
    description: "JavaScript tooling and runtime work for KOTOR-oriented browser and Node workflows.",
    freshnessPolicy: "main branch sync with manual source pinning",
    approvalScope: "public source code",
    tags: ["kotor.js", "javascript", "web", "tooling"],
  },
  {
    id: "approved-discord-knowledge",
    name: "Approved Discord Knowledge",
    kind: "discord",
    homeUrl: "discord://approved-channels",
    description: "Opt-in channel archive for project discussion, troubleshooting, and staff-approved historical answers.",
    freshnessPolicy: "live incremental indexing plus backfill per approved channel",
    approvalScope: "approved guild channels only",
    tags: ["discord", "history", "qa", "community"],
  },
];

export const traskApprovedResearchSources: readonly SourceDescriptor[] = defaultSourceCatalog.filter(
  (source) => source.kind !== "discord",
);

export const traskApprovedResearchSourceUrls: readonly string[] = traskApprovedResearchSources.map(
  (source) => source.homeUrl,
);

export class StaticCatalogSearchProvider implements SearchProvider {
  public constructor(
    private readonly sources: readonly SourceDescriptor[] = defaultSourceCatalog,
    private readonly reindexQueue: FileReindexQueueStore,
  ) {}

  public async listSources(): Promise<readonly SourceDescriptor[]> {
    return this.sources;
  }

  public async search(query: string, limit = 5): Promise<readonly SearchHit[]> {
    const tokens = tokenize(query);

    if (tokens.length === 0) {
      return [];
    }

    const hits = this.sources
      .map((source) => {
        const titleTokens = tokenize(source.name);
        const descriptionTokens = tokenize(source.description);
        const tagTokens = source.tags.flatMap((tag) => tokenize(tag));

        let score = 0;

        for (const token of tokens) {
          if (titleTokens.includes(token)) {
            score += 5;
          }

          if (descriptionTokens.includes(token)) {
            score += 2;
          }

          if (tagTokens.includes(token)) {
            score += 3;
          }

          if (source.homeUrl.toLowerCase().includes(token)) {
            score += 1;
          }
        }

        const hit: SearchHit = {
          sourceId: source.id,
          sourceName: source.name,
          kind: source.kind,
          title: `${source.name} (${source.kind})`,
          snippet: source.description,
          url: source.homeUrl,
          score,
          tags: source.tags,
        };

        return hit;
      })
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    return hits;
  }

  public async queueReindex(sourceIds?: readonly string[]): Promise<{ queuedSourceIds: readonly string[]; mode: "file-queue" }> {
    const knownSourceIds = new Set(this.sources.map((source) => source.id));
    const requestedIds = sourceIds?.length
      ? sourceIds
      : this.sources.map((source) => source.id);
    const queuedSourceIds = [...new Set(requestedIds)].filter((sourceId) => knownSourceIds.has(sourceId));

    const persistedQueueIds = await this.reindexQueue.enqueue(queuedSourceIds);
    return {
      queuedSourceIds: persistedQueueIds,
      mode: "file-queue",
    };
  }
}

export const createDefaultSearchProvider = (options?: {
  stateDir?: string;
  sources?: readonly SourceDescriptor[];
}): SearchProvider => {
  const sources = options?.sources ?? defaultSourceCatalog;
  const reindexQueue = new FileReindexQueueStore(options?.stateDir ?? "data/ingest-worker");
  return new StaticCatalogSearchProvider(sources, reindexQueue);
};

// ---------------------------------------------------------------------------
// Chunk-based search — persisted text chunks from indexed sources
// ---------------------------------------------------------------------------

export interface ChunkRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  url: string;
  title: string;
  chunkText: string;
  fetchedAt: number;
  chunkIndex: number;
  tags: readonly string[];
}

export interface SourceIndexRecord {
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  url: string;
  chunkCount: number;
  lastFetchedAt: number;
  tags: readonly string[];
}

type SerializableValue = object | string | number | boolean | null;

export class FileChunkStore {
  public constructor(private readonly stateDir: string) {}

  private chunksDir(): string {
    return path.join(this.stateDir, "chunks");
  }

  private sourceDir(sourceId: string): string {
    return path.join(this.chunksDir(), sourceId);
  }

  private sourceIndexPath(sourceId: string): string {
    return path.join(this.sourceDir(sourceId), "_index.json");
  }

  private async writeJsonAtomic(filePath: string, payload: SerializableValue): Promise<void> {
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
    await rename(tempPath, filePath);
  }

  private async quarantineCorruptFile(filePath: string): Promise<void> {
    const quarantinePath = `${filePath}.corrupt.${Date.now()}`;
    await rename(filePath, quarantinePath);
  }

  public async saveChunk(chunk: ChunkRecord): Promise<void> {
    await mkdir(this.sourceDir(chunk.sourceId), { recursive: true });
    const filePath = path.join(this.sourceDir(chunk.sourceId), `${chunk.id}.json`);
    await this.writeJsonAtomic(filePath, chunk);
  }

  /** Persist a source-level index manifest after all chunks for that source are written. */
  public async saveSourceIndex(record: SourceIndexRecord): Promise<void> {
    await mkdir(this.sourceDir(record.sourceId), { recursive: true });
    await this.writeJsonAtomic(this.sourceIndexPath(record.sourceId), record);
  }

  /** Load the index manifest for a single source, or undefined if not present. */
  public async loadSourceIndex(sourceId: string): Promise<SourceIndexRecord | undefined> {
    const indexPath = this.sourceIndexPath(sourceId);
    let raw: string;

    try {
      raw = await readFile(indexPath, "utf8");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === "ENOENT") {
        return undefined;
      }
      throw error;
    }

    try {
      return JSON.parse(raw) as SourceIndexRecord;
    } catch {
      await this.quarantineCorruptFile(indexPath).catch(() => {
        // Ignore quarantine failures; best effort only.
      });
      return undefined;
    }
  }

  /** Load all source index manifests that exist on disk. */
  public async loadAllSourceIndexes(): Promise<SourceIndexRecord[]> {
    const results: SourceIndexRecord[] = [];

    let sourceDirs: string[];
    try {
      sourceDirs = await readdir(this.chunksDir());
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }

    for (const sourceId of sourceDirs) {
      const record = await this.loadSourceIndex(sourceId);
      if (record) results.push(record);
    }

    return results;
  }

  public async loadAllChunks(): Promise<ChunkRecord[]> {
    const results: ChunkRecord[] = [];

    let sourceDirs: string[];
    try {
      sourceDirs = await readdir(this.chunksDir());
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }

    for (const sourceId of sourceDirs) {
      results.push(...(await this.loadChunksForSource(sourceId)));
    }

    return results;
  }

  public async loadChunksForSource(sourceId: string): Promise<ChunkRecord[]> {
    const dir = this.sourceDir(sourceId);
    const results: ChunkRecord[] = [];

    let files: string[];
    try {
      files = await readdir(dir);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }

    for (const file of files.filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
      const filePath = path.join(dir, file);
      try {
        const raw = await readFile(filePath, "utf8");
        results.push(JSON.parse(raw) as ChunkRecord);
      } catch {
        await this.quarantineCorruptFile(filePath).catch(() => {
          // Ignore quarantine failures; best effort only.
        });
      }
    }

    return results;
  }

  public async listIndexedSourceIds(): Promise<string[]> {
    try {
      return await readdir(this.chunksDir());
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

export class ChunkSearchProvider implements SearchProvider {
  public constructor(
    private readonly chunkStore: FileChunkStore,
    private readonly catalog: StaticCatalogSearchProvider,
  ) {}

  public async listSources(): Promise<readonly SourceDescriptor[]> {
    return this.catalog.listSources();
  }

  public async search(query: string, limit = 5): Promise<readonly SearchHit[]> {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const [catalogHits, allChunks] = await Promise.all([
      this.catalog.search(query, limit),
      this.chunkStore.loadAllChunks(),
    ]);

    const chunkHits: SearchHit[] = allChunks
      .map((chunk) => {
        const textTokens = tokenize(chunk.chunkText);
        const titleTokens = tokenize(chunk.title);
        const tagTokens = chunk.tags.flatMap((t) => tokenize(t));
        let score = 0;

        for (const token of tokens) {
          score += titleTokens.filter((t) => t === token).length * 5;
          score += tagTokens.filter((t) => t === token).length * 3;
          score += textTokens.filter((t) => t === token).length;
        }

        return {
          sourceId: chunk.sourceId,
          sourceName: chunk.sourceName,
          kind: chunk.kind,
          title: chunk.title,
          snippet: chunk.chunkText.slice(0, 200).trim() + (chunk.chunkText.length > 200 ? "\u2026" : ""),
          url: chunk.url,
          score,
          tags: chunk.tags,
        } satisfies SearchHit;
      })
      .filter((h) => h.score > 0);

    // Merge chunk hits (more specific) before catalog hits, dedup by url.
    const seen = new Set<string>();
    const merged: SearchHit[] = [];

    for (const hit of [...chunkHits, ...catalogHits].sort((a, b) => b.score - a.score)) {
      if (!seen.has(hit.url)) {
        seen.add(hit.url);
        merged.push(hit);
      }
      if (merged.length >= limit) break;
    }

    return merged;
  }

  public async queueReindex(sourceIds?: readonly string[]): Promise<{ queuedSourceIds: readonly string[]; mode: "file-queue" }> {
    return this.catalog.queueReindex(sourceIds);
  }
}

export const createChunkSearchProvider = (stateDir: string): ChunkSearchProvider => {
  return new ChunkSearchProvider(
    new FileChunkStore(stateDir),
    new StaticCatalogSearchProvider(defaultSourceCatalog, new FileReindexQueueStore(stateDir)),
  );
};