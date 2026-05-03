import { extractBearerToken, requireBearerToken } from "./bearer-tokens.js";

export interface AuthResolver<TContext, TResolved> {
  readonly name?: string;
  resolve(context: TContext): Promise<TResolved | null> | TResolved | null;
}

export interface BearerAuthContext {
  authHeader: string | undefined;
  token: string;
}

export interface SessionResolverResult<TAccount, TSession> {
  account: TAccount;
  session: TSession;
}

export interface ExternalAccountInput {
  providerUserId: string;
  username: string;
  displayName: string;
}

export interface ExternalAccountResult<TAccount> {
  account: TAccount;
}

export interface CreateSessionAuthResolverOptions<TAccount, TSession, TResolved> {
  name?: string;
  resolveSessionToken: (token: string) => Promise<SessionResolverResult<TAccount, TSession> | undefined>;
  mapResolvedSession: (resolved: SessionResolverResult<TAccount, TSession>) => TResolved;
}

export interface CreateDevBearerAuthResolverOptions<TAccount, TResolved> {
  name?: string;
  enabled?: boolean;
  prefix?: string;
  decodeUserId?: (rawId: string) => string;
  createUsername?: (providerUserId: string) => string;
  createDisplayName?: (providerUserId: string) => string;
  ensureAccount: (input: ExternalAccountInput) => Promise<ExternalAccountResult<TAccount>>;
  mapResolvedAccount: (resolved: ExternalAccountInput & { account: TAccount }) => TResolved;
}

export interface CreateHeaderProfileAuthResolverOptions<TProfile, TAccount, TResolved> {
  name?: string;
  resolveProfile: (authHeader: string | undefined) => Promise<TProfile>;
  ensureAccount: (input: ExternalAccountInput) => Promise<ExternalAccountResult<TAccount>>;
  getProviderUserId: (profile: TProfile) => string;
  getUsername: (profile: TProfile) => string;
  getDisplayName: (profile: TProfile) => string;
  mapResolvedAccount: (resolved: { account: TAccount; profile: TProfile; providerUserId: string; username: string; displayName: string }) => TResolved;
}

/** Normalized error passed to {@link AuthRequestHandlerFactoryOptions.sendError} after auth handler catches a thrown value. */
export interface NormalizedAuthHandlerError {
  readonly status: number;
  readonly message: string;
}

/**
 * Superset of values commonly thrown or passed through auth handlers.
 * ECMAScript `catch` bindings are not statically typed; narrow at the call site with `error as AuthHandlerThrown`.
 */
export type AuthHandlerThrown =
  | string
  | number
  | bigint
  | boolean
  | symbol
  | null
  | undefined
  | object;

/** Converts a thrown catch value into a stable shape for HTTP responses. */
export const normalizeAuthHandlerError = (error: AuthHandlerThrown): NormalizedAuthHandlerError => {
  let status = 500;
  if (typeof error === "object" && error !== null) {
    const candidate = Reflect.get(error, "status");
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      status = candidate;
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);

  return { status, message };
};

export interface AuthRequestHandlerFactoryOptions<TRequest, TResponse, TResolved> {
  resolvers: readonly AuthResolver<BearerAuthContext, TResolved>[];
  invalidMessage?: string;
  getAuthHeader: (request: TRequest) => string | undefined;
  sendError: (response: TResponse, error: NormalizedAuthHandlerError) => void | Promise<void>;
}

export type RequiredAuthHandler<TRequest, TResponse, TResolved> = (
  request: TRequest,
  response: TResponse,
  resolved: TResolved,
) => void | Promise<void>;

export type OptionalAuthHandler<TRequest, TResponse, TResolved> = (
  request: TRequest,
  response: TResponse,
  resolved: TResolved | null,
) => void | Promise<void>;

const defaultDevUserIdDecoder = (rawId: string): string => decodeURIComponent(rawId);

const defaultDevUsername = (providerUserId: string): string => {
  return providerUserId.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 32) || "devuser";
};

export const createBearerAuthContext = (authHeader: string | undefined): BearerAuthContext => ({
  authHeader,
  token: requireBearerToken(authHeader),
});

export const resolveWithAuthResolvers = async <TContext, TResolved>(
  context: TContext,
  resolvers: readonly AuthResolver<TContext, TResolved>[],
): Promise<TResolved | null> => {
  for (const resolver of resolvers) {
    const resolved = await resolver.resolve(context);
    if (resolved !== null) {
      return resolved;
    }
  }

  return null;
};

export const createSessionAuthResolver = <TAccount, TSession, TResolved>(
  options: CreateSessionAuthResolverOptions<TAccount, TSession, TResolved>,
): AuthResolver<BearerAuthContext, TResolved> => {
  return {
    ...(options.name ? { name: options.name } : { name: "session" }),
    resolve: async ({ token }) => {
      const resolved = await options.resolveSessionToken(token);
      return resolved ? options.mapResolvedSession(resolved) : null;
    },
  };
};

export const createDevBearerAuthResolver = <TAccount, TResolved>(
  options: CreateDevBearerAuthResolverOptions<TAccount, TResolved>,
): AuthResolver<BearerAuthContext, TResolved> => {
  const prefix = options.prefix ?? "dev-user-";
  const decodeUserId = options.decodeUserId ?? defaultDevUserIdDecoder;
  const createUsername = options.createUsername ?? defaultDevUsername;
  const createDisplayName = options.createDisplayName ?? ((providerUserId: string) => providerUserId);

  return {
    ...(options.name ? { name: options.name } : { name: "dev" }),
    resolve: async ({ authHeader }) => {
      if (!options.enabled) {
        return null;
      }

      const token = extractBearerToken(authHeader);
      if (!token || !token.startsWith(prefix)) {
        return null;
      }

      const rawId = token.slice(prefix.length).trim();
      if (!rawId) {
        throw Object.assign(new Error("Invalid dev auth token format."), { status: 401 });
      }

      const providerUserId = decodeUserId(rawId);
      const username = createUsername(providerUserId);
      const displayName = createDisplayName(providerUserId);
      const { account } = await options.ensureAccount({ providerUserId, username, displayName });

      return options.mapResolvedAccount({ account, providerUserId, username, displayName });
    },
  };
};

export const createHeaderProfileAuthResolver = <TProfile, TAccount, TResolved>(
  options: CreateHeaderProfileAuthResolverOptions<TProfile, TAccount, TResolved>,
): AuthResolver<BearerAuthContext, TResolved> => {
  return {
    ...(options.name ? { name: options.name } : {}),
    resolve: async ({ authHeader }) => {
      const profile = await options.resolveProfile(authHeader);
      const providerUserId = options.getProviderUserId(profile);
      const username = options.getUsername(profile);
      const displayName = options.getDisplayName(profile);
      const { account } = await options.ensureAccount({ providerUserId, username, displayName });

      return options.mapResolvedAccount({
        account,
        profile,
        providerUserId,
        username,
        displayName,
      });
    },
  };
};

export const resolveRequiredWithAuthResolvers = async <TResolved>(
  authHeader: string | undefined,
  resolvers: readonly AuthResolver<BearerAuthContext, TResolved>[],
  invalidMessage = "Unauthorized.",
): Promise<TResolved> => {
  const context = createBearerAuthContext(authHeader);
  const resolved = await resolveWithAuthResolvers(context, resolvers);

  if (resolved === null) {
    throw Object.assign(new Error(invalidMessage), { status: 401 });
  }

  return resolved;
};

export const resolveOptionalWithAuthResolvers = async <TResolved>(
  authHeader: string | undefined,
  resolvers: readonly AuthResolver<BearerAuthContext, TResolved>[],
  invalidMessage = "Unauthorized.",
): Promise<TResolved | null> => {
  try {
    return await resolveRequiredWithAuthResolvers(authHeader, resolvers, invalidMessage);
  } catch {
    return null;
  }
};

export const createRequiredAuthHandler = <TRequest, TResponse, TResolved>(
  options: AuthRequestHandlerFactoryOptions<TRequest, TResponse, TResolved>,
  handler: RequiredAuthHandler<TRequest, TResponse, TResolved>,
): ((request: TRequest, response: TResponse) => Promise<void>) => {
  return async (request, response): Promise<void> => {
    try {
      const resolved = await resolveRequiredWithAuthResolvers(
        options.getAuthHeader(request),
        options.resolvers,
        options.invalidMessage,
      );
      await handler(request, response, resolved);
    } catch (error) {
      await options.sendError(response, normalizeAuthHandlerError(error as AuthHandlerThrown));
    }
  };
};

export const createOptionalAuthHandler = <TRequest, TResponse, TResolved>(
  options: AuthRequestHandlerFactoryOptions<TRequest, TResponse, TResolved>,
  handler: OptionalAuthHandler<TRequest, TResponse, TResolved>,
): ((request: TRequest, response: TResponse) => Promise<void>) => {
  return async (request, response): Promise<void> => {
    try {
      const resolved = await resolveOptionalWithAuthResolvers(
        options.getAuthHeader(request),
        options.resolvers,
        options.invalidMessage,
      );
      await handler(request, response, resolved);
    } catch (error) {
      await options.sendError(response, normalizeAuthHandlerError(error as AuthHandlerThrown));
    }
  };
};