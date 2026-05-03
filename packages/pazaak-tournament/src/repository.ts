import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { TournamentState } from "./types.js";

/**
 * Abstract repository interface so the matchmaking worker (Cloudflare KV) and
 * the Discord bot (on-disk JSON) can share the same engine code paths.
 */
export interface TournamentRepository {
  list(): Promise<TournamentState[]>;
  get(tournamentId: string): Promise<TournamentState | null>;
  save(state: TournamentState): Promise<void>;
  delete(tournamentId: string): Promise<void>;
}

interface JsonTournamentRepositoryFile {
  version: 1;
  tournaments: TournamentState[];
}

/**
 * File-backed implementation used by the Discord bot. Keeps every tournament in a
 * single JSON file (matches the wallet/sideboard repository pattern).
 */
export class JsonTournamentRepository implements TournamentRepository {
  private cache: Map<string, TournamentState> | null = null;
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  public async list(): Promise<TournamentState[]> {
    const cache = await this.ensureCache();
    return [...cache.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  public async get(tournamentId: string): Promise<TournamentState | null> {
    const cache = await this.ensureCache();
    return cache.get(tournamentId) ?? null;
  }

  public async save(state: TournamentState): Promise<void> {
    const cache = await this.ensureCache();
    cache.set(state.id, state);
    await this.flush(cache);
  }

  public async delete(tournamentId: string): Promise<void> {
    const cache = await this.ensureCache();
    if (cache.delete(tournamentId)) {
      await this.flush(cache);
    }
  }

  private async ensureCache(): Promise<Map<string, TournamentState>> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as JsonTournamentRepositoryFile;
      const cache = new Map<string, TournamentState>();

      if (parsed && Array.isArray(parsed.tournaments)) {
        for (const entry of parsed.tournaments) {
          if (entry && typeof entry.id === "string") {
            cache.set(entry.id, entry);
          }
        }
      }

      this.cache = cache;
      return cache;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const cache = new Map<string, TournamentState>();
        this.cache = cache;
        return cache;
      }
      throw err;
    }
  }

  private async flush(cache: Map<string, TournamentState>): Promise<void> {
    const payload: JsonTournamentRepositoryFile = {
      version: 1,
      tournaments: [...cache.values()],
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

/** Pure in-memory repository for the matchmaking worker / tests. */
export class InMemoryTournamentRepository implements TournamentRepository {
  private readonly cache = new Map<string, TournamentState>();

  public async list(): Promise<TournamentState[]> {
    return [...this.cache.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  public async get(tournamentId: string): Promise<TournamentState | null> {
    return this.cache.get(tournamentId) ?? null;
  }

  public async save(state: TournamentState): Promise<void> {
    this.cache.set(state.id, state);
  }

  public async delete(tournamentId: string): Promise<void> {
    this.cache.delete(tournamentId);
  }
}
