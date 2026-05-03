import {
  type MatchPersistence,
  type PazaakMatch,
  PazaakCoordinator,
  type SerializedMatch,
  deserializeMatch,
  serializeMatch,
} from "@openkotor/pazaak-engine";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface MatchActorEnv {
  PAZAAK_TURN_TIMEOUT_MS?: string;
  PAZAAK_DISCONNECT_FORFEIT_MS?: string;
}

type CommandLogEntry = {
  seq: number;
  at: string;
  type: string;
  userId: string;
  clientMoveId: string | null;
};

function json(data: JsonValue | object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** One DO per match (`MATCH_ACTOR.idFromName(matchId)`). Persists snapshot + command log + idempotency keys. */
export class MatchActor {
  private readonly ctx: DurableObjectState;
  private readonly env: MatchActorEnv;
  private coordinator: PazaakCoordinator | null = null;
  private initPromise: Promise<PazaakCoordinator> | null = null;

  constructor(ctx: DurableObjectState, env: MatchActorEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  private coordinatorOptions(): ConstructorParameters<typeof PazaakCoordinator>[1] {
    const turnMs = Number(this.env.PAZAAK_TURN_TIMEOUT_MS ?? "300000");
    const discMs = Number(this.env.PAZAAK_DISCONNECT_FORFEIT_MS ?? "30000");
    return {
      turnTimeoutMs: Number.isFinite(turnMs) ? turnMs : 300_000,
      disconnectForfeitMs: Number.isFinite(discMs) ? discMs : 30_000,
    };
  }

  private async ensureCoordinator(): Promise<PazaakCoordinator> {
    if (this.coordinator) return this.coordinator;
    if (!this.initPromise) {
      const persistence = new DurableMatchPersistence(this.ctx);
      const coord = new PazaakCoordinator(persistence, this.coordinatorOptions());
      this.initPromise = coord.initialize().then(() => coord);
    }
    this.coordinator = await this.initPromise;
    return this.coordinator;
  }

  private async bumpSeq(): Promise<number> {
    const prev = (await this.ctx.storage.get<number>("seq")) ?? 0;
    const next = prev + 1;
    await this.ctx.storage.put("seq", next);
    return next;
  }

  private async appendCommandLog(meta: {
    seq: number;
    type: string;
    userId: string;
    clientMoveId: string | null;
  }): Promise<void> {
    const log = (await this.ctx.storage.get<CommandLogEntry[]>("commandLog")) ?? [];
    log.push({
      seq: meta.seq,
      at: new Date().toISOString(),
      type: meta.type,
      userId: meta.userId,
      clientMoveId: meta.clientMoveId,
    });
    await this.ctx.storage.put("commandLog", log.slice(-500));
  }

  private async scheduleTickIfActive(): Promise<void> {
    const snap = await this.ctx.storage.get<SerializedMatch>("snapshot");
    if (!snap) return;
    const phase = deserializeMatch(snap).phase;
    if (phase === "completed") return;
    await this.ctx.storage.setAlarm(Date.now() + 5000);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization,content-type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
      });
    }

    if (url.pathname === "/snapshot" && request.method === "POST") {
      const body = (await request.json()) as { snapshot?: SerializedMatch };
      if (!body.snapshot) {
        return error("snapshot required", 400);
      }
      await this.ctx.storage.put("snapshot", body.snapshot);
      return json({ ok: true });
    }

    if (url.pathname === "/tick" && request.method === "POST") {
      const coord = await this.ensureCoordinator();
      coord.tickTurnTimers();
      coord.tickDisconnectForfeits();
      return json({ ok: true });
    }

    if (url.pathname === "/state" && request.method === "GET") {
      const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");
      const snap = await this.ctx.storage.get<SerializedMatch>("snapshot");
      const log = (await this.ctx.storage.get<CommandLogEntry[]>("commandLog")) ?? [];
      const seq = (await this.ctx.storage.get<number>("seq")) ?? 0;
      const tail = log.filter((e) => e.seq > afterSeq);
      return json({ snapshot: snap ?? null, seq, logTail: tail });
    }

    if (url.pathname === "/create" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const matchId = String(body.matchId ?? "").trim();
      const p1Id = String(body.playerOneId ?? "").trim();
      const p2Id = String(body.playerTwoId ?? "").trim();
      const p1Name = String(body.playerOneName ?? "Player 1").slice(0, 48);
      const p2Name = String(body.playerTwoName ?? "Player 2").slice(0, 48);
      const gameMode = body.gameMode === "wacky" ? "wacky" : "canonical";
      const setsToWin = typeof body.setsToWin === "number" ? body.setsToWin : undefined;
      if (!matchId || !p1Id || !p2Id) {
        return error("matchId, playerOneId, and playerTwoId are required", 400);
      }

      const existing = await this.ctx.storage.get<SerializedMatch>("snapshot");
      if (existing) {
        await this.ensureCoordinator();
        return json({ snapshot: existing, alreadyExists: true });
      }

      const coord = await this.ensureCoordinator();
      try {
        coord.createDirectMatch({
          channelId: `web:${matchId}`,
          challengerId: p1Id,
          challengerName: p1Name,
          opponentId: p2Id,
          opponentName: p2Name,
          wager: typeof body.wager === "number" ? body.wager : 0,
          setsToWin,
          gameMode,
          matchId,
        });
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err), 400);
      }

      const seq = await this.bumpSeq();
      await this.appendCommandLog({
        seq,
        type: "create",
        userId: p1Id,
        clientMoveId: null,
      });

      await this.scheduleTickIfActive();

      const snap = await this.ctx.storage.get<SerializedMatch>("snapshot");
      return json({ snapshot: snap });
    }

    if (url.pathname === "/command" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const matchId = String(body.matchId ?? "").trim();
      const userId = String(body.userId ?? "").trim();
      const kind = String(body.type ?? "").trim();
      const clientMoveId = typeof body.clientMoveId === "string" ? body.clientMoveId.trim() : "";

      if (!matchId || !userId || !kind) {
        return error("matchId, userId, and type are required", 400);
      }

      if (clientMoveId) {
        const cached = await this.ctx.storage.get<SerializedMatch>(`idem:${clientMoveId}`);
        if (cached) {
          const seq = (await this.ctx.storage.get<number>("seq")) ?? 0;
          return json({ duplicate: true, snapshot: cached, seq });
        }
      }

      const coord = await this.ensureCoordinator();
      let updated: PazaakMatch;
      try {
        switch (kind) {
          case "draw":
            updated = coord.draw(matchId, userId);
            break;
          case "stand":
            updated = coord.stand(matchId, userId);
            break;
          case "end_turn":
            updated = coord.endTurn(matchId, userId);
            break;
          case "forfeit":
            updated = coord.forfeit(matchId, userId);
            break;
          case "play_side": {
            const cardId = String(body.cardId ?? "").trim();
            const appliedValue = Number(body.appliedValue ?? 0);
            updated = coord.playSideCard(matchId, userId, cardId, appliedValue);
            break;
          }
          default:
            return error(`Unknown command type: ${kind}`, 400);
        }
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err), 400);
      }

      const seq = await this.bumpSeq();
      if (clientMoveId) {
        await this.ctx.storage.put(`idem:${clientMoveId}`, serializeMatch(updated));
      }
      await this.appendCommandLog({ seq, type: kind, userId, clientMoveId: clientMoveId || null });

      await this.scheduleTickIfActive();

      return json({ snapshot: serializeMatch(updated), seq });
    }

    return error("Not found", 404);
  }

  async alarm(): Promise<void> {
    const coord = await this.ensureCoordinator();
    coord.tickTurnTimers();
    coord.tickDisconnectForfeits();
    await this.scheduleTickIfActive();
  }
}

class DurableMatchPersistence implements MatchPersistence {
  constructor(private readonly ctx: DurableObjectState) {}

  async save(match: PazaakMatch): Promise<void> {
    await this.ctx.storage.put("snapshot", serializeMatch(match));
  }

  async loadActive(maxAgeMs: number): Promise<PazaakMatch[]> {
    const snap = await this.ctx.storage.get<SerializedMatch>("snapshot");
    if (!snap) return [];
    const m = deserializeMatch(snap);
    if (m.phase === "completed") return [];
    if (Date.now() - m.updatedAt > maxAgeMs) return [];
    return [m];
  }
}
