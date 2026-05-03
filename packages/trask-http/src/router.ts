import { randomUUID } from "node:crypto";



import type {
  JsonTraskQueryRepository,
  TraskQueryLiveEvent,
  TraskQueryRecord,
  TraskSourceRecord,
} from "@openkotor/persistence";

import { normalizeAuthHandlerError, type AuthHandlerThrown } from "@openkotor/platform/auth";

import type { SearchProvider } from "@openkotor/retrieval";

import type { ResearchWizardProgressEvent, ResearchWizardQueryHandler } from "@openkotor/trask";

import { Router, type Request, type Response, type RequestHandler } from "express";



export interface TraskHttpRuntime {

  searchProvider: SearchProvider;

  researchWizard: ResearchWizardQueryHandler;

  queryRepository: JsonTraskQueryRepository;

}



type ScalarOrObject = string | number | boolean | null | object | undefined;



/** Authenticated user; omit persistQueries or set true to write queries to disk. */

export interface TraskHttpUser {

  id: string;

  persistQueries?: boolean;

}



export interface TraskHttpAuth<TUser extends TraskHttpUser = TraskHttpUser> {

  requireAuth(handler: (req: Request, res: Response, user: TUser) => void | Promise<void>): RequestHandler;

}



/** Matches Holocron (`vendor/qa-webui`) `TraskSessionDto`. */

export interface TraskHttpSessionDto {

  loggedIn: boolean;

  oauthAvailable?: boolean;

  discord?: { id: string; username: string; displayName: string };

}



export interface CreateTraskHttpRouterOptions<TUser extends TraskHttpUser = TraskHttpUser> {

  runtime: TraskHttpRuntime | undefined;

  auth: TraskHttpAuth<TUser>;

  /** GET `/session`. Default: `{ loggedIn: false, oauthAvailable: false }`. */

  getSession?: (req: Request) => TraskHttpSessionDto | Promise<TraskHttpSessionDto>;

  /** POST `/auth/logout`. Default: `204` empty body. */

  onLogout?: (req: Request, res: Response) => void | Promise<void>;

}



const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;



export const isTraskThreadId = (value: string): boolean => UUID_RE.test(value.trim());



const normalizeTraskQuery = (value: ScalarOrObject | undefined): string => {

  if (typeof value !== "string") {

    throw Object.assign(new Error("Body must include a string query."), { status: 422 });

  }



  const query = value.trim();

  if (!query) {

    throw Object.assign(new Error("Query is required."), { status: 422 });

  }



  if (query.length > 200) {

    throw Object.assign(new Error("Query must be 200 characters or fewer."), { status: 422 });

  }



  return query;

};



const normalizeTraskHistoryLimit = (value: ScalarOrObject | undefined): number => {

  const raw = Number(value ?? 25);

  if (!Number.isFinite(raw)) return 25;

  return Math.max(1, Math.min(100, Math.trunc(raw)));

};



const readOptionalHttpStatus = (e: AuthHandlerThrown): number | undefined => {

  if (typeof e === "object" && e !== null) {

    const s = Reflect.get(e, "status");

    if (typeof s === "number" && Number.isFinite(s)) {

      return s;

    }

  }

  return undefined;

};



const mapTraskQueryRecord = (record: TraskQueryRecord): TraskQueryRecord => ({
  ...record,
  sources: record.sources.map((source) => ({ ...source })),
  ...(record.liveTrace
    ? {
        liveTrace: record.liveTrace.map((ev) => ({
          ...ev,
          ...(ev.sources ? { sources: ev.sources.map((s) => ({ ...s })) } : {}),
        })),
      }
    : {}),
});

const mapDescriptorsToSourceRecords = (
  sources: ResearchWizardProgressEvent["sources"],
): readonly TraskSourceRecord[] => {
  if (!sources?.length) return [];
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.homeUrl,
  }));
};

const appendLiveTrace = async (
  repository: JsonTraskQueryRepository,
  queryId: string,
  event: Omit<TraskQueryLiveEvent, "at"> & { at?: string },
): Promise<void> => {
  const prev = await repository.getByQueryId(queryId);
  if (!prev) return;
  const row: TraskQueryLiveEvent = {
    at: event.at ?? new Date().toISOString(),
    phase: event.phase,
    ...(event.detail !== undefined ? { detail: event.detail } : {}),
    ...(event.sources?.length ? { sources: event.sources.map((s) => ({ ...s })) } : {}),
  };
  await repository.upsert({
    ...prev,
    liveTrace: [...(prev.liveTrace ?? []), row],
  });
};



const shouldPersistForUser = (user: TraskHttpUser): boolean => {

  return user.persistQueries !== false;

};



const normalizeThreadIdFromBody = (raw: ScalarOrObject | undefined): string => {

  if (raw === undefined || raw === null) {

    return randomUUID();

  }

  if (typeof raw !== "string") {

    throw Object.assign(new Error("threadId must be a UUID string when provided."), { status: 422 });

  }

  const trimmed = raw.trim();

  if (!trimmed) {

    return randomUUID();

  }

  if (!isTraskThreadId(trimmed)) {

    throw Object.assign(new Error("threadId must be a valid UUID."), { status: 422 });

  }

  return trimmed;

};



export const createTraskHttpRouter = <TUser extends TraskHttpUser = TraskHttpUser>(

  options: CreateTraskHttpRouterOptions<TUser>,

): Router => {

  const router = Router();



  const requireRuntime = (): TraskHttpRuntime => {

    if (!options.runtime) {

      throw Object.assign(new Error("Trask runtime is not configured on this server."), { status: 503 });

    }

    return options.runtime;

  };



  const handleTraskError = (res: Response, err: AuthHandlerThrown): void => {

    const { status, message } = normalizeAuthHandlerError(err);

    res.status(status).json({ error: message });

  };



  router.get("/session", async (req: Request, res: Response) => {

    try {

      const body = options.getSession

        ? await options.getSession(req)

        : { loggedIn: false, oauthAvailable: false };

      res.json(body);

    } catch (err) {

      handleTraskError(res, err as AuthHandlerThrown);

    }

  });



  router.post("/auth/logout", async (req: Request, res: Response) => {

    try {

      if (options.onLogout) {

        await options.onLogout(req, res);

      } else {

        res.status(204).end();

      }

    } catch (err) {

      handleTraskError(res, err as AuthHandlerThrown);

    }

  });



  router.get("/thread/:threadId", async (req: Request, res: Response) => {

    try {

      const threadId = typeof req.params.threadId === "string" ? req.params.threadId.trim() : "";

      if (!isTraskThreadId(threadId)) {

        res.status(400).json({ error: "Invalid thread id." });

        return;

      }

      const trask = requireRuntime();

      const history = await trask.queryRepository.listForThread(threadId);

      res.json({ history: history.map(mapTraskQueryRecord) });

    } catch (err) {

      handleTraskError(res, err as AuthHandlerThrown);

    }

  });



  router.get(

    "/sources",

    options.auth.requireAuth(async (_req, res, _user) => {

      try {

        const trask = requireRuntime();

        const sources = await trask.searchProvider.listSources();

        res.json({

          sources: sources.map((source) => ({

            id: source.id,

            name: source.name,

            kind: source.kind,

            homeUrl: source.homeUrl,

            description: source.description,

            freshnessPolicy: source.freshnessPolicy,

          })),

        });

      } catch (err) {

        handleTraskError(res, err as AuthHandlerThrown);

      }

    }),

  );



  router.get(

    "/history",

    options.auth.requireAuth(async (req, res, user) => {

      try {

        if (!shouldPersistForUser(user)) {

          res.json({ history: [] });

          return;

        }

        const trask = requireRuntime();

        const threadRaw = req.query.thread;

        const threadFilter =

          typeof threadRaw === "string" && isTraskThreadId(threadRaw.trim()) ? threadRaw.trim() : undefined;

        const history = await trask.queryRepository.listForUser(

          user.id,

          normalizeTraskHistoryLimit(req.query.limit),

          threadFilter,

        );

        res.json({ history: history.map(mapTraskQueryRecord) });

      } catch (err) {

        handleTraskError(res, err as AuthHandlerThrown);

      }

    }),

  );



  router.post(

    "/ask",

    options.auth.requireAuth(async (req, res, user) => {

      const trask = requireRuntime();

      let query: string;

      let threadId: string;

      const persist = shouldPersistForUser(user);



      try {

        const body = req.body as { query?: ScalarOrObject; threadId?: ScalarOrObject };

        query = normalizeTraskQuery(body.query);

        threadId = normalizeThreadIdFromBody(body.threadId);

      } catch (err) {

        const e = err as AuthHandlerThrown;

        const status = readOptionalHttpStatus(e) ?? 422;

        const message = e instanceof Error ? e.message : String(e);

        res.status(status).json({ error: message });

        return;

      }



      const queryId = randomUUID();

      const createdAt = new Date().toISOString();

      if (!persist) {
        try {
          const result = await trask.researchWizard.answerQuestion(query);

          const record: TraskQueryRecord = {
            queryId,
            threadId,
            userId: user.id,
            query,
            status: "complete",
            answer: result.answer,
            sources: result.approvedSources.map((source) => ({
              id: source.id,
              name: source.name,
              url: source.homeUrl,
            })),
            error: null,
            createdAt,
            completedAt: new Date().toISOString(),
          };

          res.status(201).json({ query: mapTraskQueryRecord(record) });
        } catch (err) {
          const e = err as AuthHandlerThrown;

          const status = readOptionalHttpStatus(e) ?? 502;

          const message = e instanceof Error ? e.message : String(e);

          const record: TraskQueryRecord = {
            queryId,
            threadId,
            userId: user.id,
            query,
            status: "failed",
            answer: null,
            sources: [],
            error: message,
            createdAt,
            completedAt: new Date().toISOString(),
          };

          res.status(status).json({ error: message, query: mapTraskQueryRecord(record) });
        }

        return;
      }

      const pendingRecord: TraskQueryRecord = {
        queryId,
        threadId,
        userId: user.id,
        query,
        status: "pending",
        answer: null,
        sources: [],
        error: null,
        createdAt,
        completedAt: null,
        liveTrace: [
          {
            at: createdAt,
            phase: "queued",
            detail: "Holocron retrieval queued…",
          },
        ],
      };

      await trask.queryRepository.upsert(pendingRecord);

      res.status(202).json({ query: mapTraskQueryRecord(pendingRecord) });

      void (async () => {
        try {
          const result = await trask.researchWizard.answerQuestion(query, async (ev) => {
            await appendLiveTrace(trask.queryRepository, queryId, {
              phase: ev.phase,
              ...(ev.detail !== undefined ? { detail: ev.detail } : {}),
              ...(ev.sources?.length ? { sources: mapDescriptorsToSourceRecords(ev.sources) } : {}),
            });
          });

          const prev = await trask.queryRepository.getByQueryId(queryId);

          if (!prev) return;

          const completeRecord: TraskQueryRecord = {
            ...prev,
            status: "complete",
            answer: result.answer,
            sources: result.approvedSources.map((source) => ({
              id: source.id,
              name: source.name,
              url: source.homeUrl,
            })),
            error: null,
            completedAt: new Date().toISOString(),
          };

          await trask.queryRepository.upsert(completeRecord);
        } catch (err) {
          const e = err as AuthHandlerThrown;

          const status = readOptionalHttpStatus(e) ?? 502;

          const message = e instanceof Error ? e.message : String(e);

          const prev = await trask.queryRepository.getByQueryId(queryId);

          if (!prev) return;

          const failedRecord: TraskQueryRecord = {
            ...prev,
            status: "failed",
            answer: null,
            sources: [],
            error: message,
            completedAt: new Date().toISOString(),
          };

          await trask.queryRepository.upsert(failedRecord);

          void status;
        }
      })();

    }),

  );



  return router;

};


