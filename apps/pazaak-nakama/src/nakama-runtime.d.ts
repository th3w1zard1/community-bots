declare namespace nkruntime {
  interface Context {
    userId?: string;
    username?: string;
    vars?: Record<string, string>;
  }

  interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
  }

  interface MatchmakerResult {
    presence: Presence;
    properties?: Record<string, unknown>;
  }

  type MatchmakerMatchedFunction = (
    ctx: Context,
    logger: Logger,
    nk: Nakama,
    matches: MatchmakerResult[],
  ) => string;

  interface Initializer {
    registerRpc(id: string, fn: RpcFunction): void;
    registerMatch(name: string, handler: MatchHandler<any>): void;
    registerMatchmakerMatched(fn: MatchmakerMatchedFunction): void;
    registerAfterAuthenticateCustom?(fn: unknown): void;
  }

  interface Nakama {
    accountGetId(ctx: Context, userId: string): Account;
    accountUpdateId(ctx: Context, userId: string, username?: string, displayName?: string): void;
    storageRead(ctx: Context, reads: StorageReadRequest[]): StorageObject[];
    storageWrite(ctx: Context, writes: StorageWriteRequest[]): void;
    storageDelete(ctx: Context, deletes: StorageDeleteRequest[]): void;
    leaderboardCreate(
      ctx: Context,
      id: string,
      authoritative: boolean,
      sortOrder: "asc" | "desc",
      operator: "best" | "set" | "incr" | "decr",
      resetSchedule?: string,
      metadata?: Record<string, unknown>,
    ): void;
    leaderboardRecordWrite(
      ctx: Context,
      id: string,
      ownerId: string,
      username: string,
      score: number,
      subscore?: number,
      metadata?: Record<string, unknown>,
      overrideOperator?: "best" | "set" | "incr" | "decr",
    ): LeaderboardRecord;
    leaderboardRecordsList(
      ctx: Context,
      id: string,
      ownerIds?: string[] | null,
      limit?: number,
      cursor?: string | null,
      expiry?: number,
    ): LeaderboardRecords;
    matchCreate(ctx: Context, module: string, params?: Record<string, string>): string;
    /** Relay an out-of-band message into an authoritative match (invokes matchSignal on the handler). */
    matchSignal(ctx: Context, matchId: string, data: string): void;
  }

  interface Account {
    user: { id: string; username?: string; displayName?: string; createTime?: number; updateTime?: number };
  }

  interface StorageReadRequest {
    collection: string;
    key: string;
    userId: string;
  }

  interface StorageDeleteRequest {
    collection: string;
    key: string;
    userId: string;
  }

  interface StorageWriteRequest {
    collection: string;
    key: string;
    userId: string;
    value: Record<string, unknown>;
    permissionRead?: number;
    permissionWrite?: number;
  }

  interface StorageObject {
    collection: string;
    key: string;
    userId: string;
    value: Record<string, unknown>;
    version?: string;
  }

  interface LeaderboardRecord {
    ownerId: string;
    username?: string;
    score: number;
    subscore?: number;
    rank?: number;
    metadata?: Record<string, unknown>;
  }

  interface LeaderboardRecords {
    records?: LeaderboardRecord[];
    ownerRecords?: LeaderboardRecord[];
    nextCursor?: string;
  }

  interface Presence {
    userId: string;
    sessionId: string;
    username: string;
  }

  interface MatchDispatcher {
    broadcastMessage(opCode: number, data: string | Uint8Array, presences?: Presence[] | null, sender?: Presence): void;
  }

  interface MatchMessage {
    opCode: number;
    data: string | Uint8Array;
    sender: Presence;
  }

  interface MatchHandler<State = unknown> {
    matchInit: (
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      params: Record<string, string>,
    ) => { state: State; tickRate: number; label: string };
    matchJoinAttempt: (
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: MatchDispatcher,
      tick: number,
      state: State,
      presence: Presence,
      metadata: Record<string, string>,
    ) => { state: State; accept: boolean; rejectMessage?: string };
    matchJoin: (
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: MatchDispatcher,
      tick: number,
      state: State,
      presences: Presence[],
    ) => { state: State };
    matchLeave: (
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: MatchDispatcher,
      tick: number,
      state: State,
      presences: Presence[],
    ) => { state: State };
    matchLoop: (
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: MatchDispatcher,
      tick: number,
      state: State,
      messages: MatchMessage[],
    ) => { state: State } | null;
    matchTerminate: (
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: MatchDispatcher,
      tick: number,
      state: State,
      graceSeconds: number,
    ) => { state: State };
    matchSignal: (
      ctx: Context,
      logger: Logger,
      nk: Nakama,
      dispatcher: MatchDispatcher,
      tick: number,
      state: State,
      data: string,
    ) => { state: State; data: string };
  }

  type RpcFunction = (ctx: Context, logger: Logger, nk: Nakama, payload: string) => string;
}

declare const InitModule: (ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) => void;
