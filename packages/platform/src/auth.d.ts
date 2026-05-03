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
    mapResolvedAccount: (resolved: ExternalAccountInput & {
        account: TAccount;
    }) => TResolved;
}
export interface CreateHeaderProfileAuthResolverOptions<TProfile, TAccount, TResolved> {
    name?: string;
    resolveProfile: (authHeader: string | undefined) => Promise<TProfile>;
    ensureAccount: (input: ExternalAccountInput) => Promise<ExternalAccountResult<TAccount>>;
    getProviderUserId: (profile: TProfile) => string;
    getUsername: (profile: TProfile) => string;
    getDisplayName: (profile: TProfile) => string;
    mapResolvedAccount: (resolved: {
        account: TAccount;
        profile: TProfile;
        providerUserId: string;
        username: string;
        displayName: string;
    }) => TResolved;
}
/** Normalized error passed to {@link AuthRequestHandlerFactoryOptions.sendError} after auth handler catches a thrown value. */
export interface NormalizedAuthHandlerError {
    readonly status: number;
    readonly message: string;
}
/**
 * Superset of values commonly thrown or passed through auth handlers.
 * (Catch clauses still infer `unknown`; cast at the boundary: `error as AuthHandlerThrown`.)
 */
export type AuthHandlerThrown = string | number | bigint | boolean | symbol | null | undefined | object;
/** Converts a thrown catch value into a stable shape for HTTP responses. */
export declare const normalizeAuthHandlerError: (error: AuthHandlerThrown) => NormalizedAuthHandlerError;
export interface AuthRequestHandlerFactoryOptions<TRequest, TResponse, TResolved> {
    resolvers: readonly AuthResolver<BearerAuthContext, TResolved>[];
    invalidMessage?: string;
    getAuthHeader: (request: TRequest) => string | undefined;
    sendError: (response: TResponse, error: NormalizedAuthHandlerError) => void | Promise<void>;
}
export type RequiredAuthHandler<TRequest, TResponse, TResolved> = (request: TRequest, response: TResponse, resolved: TResolved) => void | Promise<void>;
export type OptionalAuthHandler<TRequest, TResponse, TResolved> = (request: TRequest, response: TResponse, resolved: TResolved | null) => void | Promise<void>;
export declare const createBearerAuthContext: (authHeader: string | undefined) => BearerAuthContext;
export declare const resolveWithAuthResolvers: <TContext, TResolved>(context: TContext, resolvers: readonly AuthResolver<TContext, TResolved>[]) => Promise<TResolved | null>;
export declare const createSessionAuthResolver: <TAccount, TSession, TResolved>(options: CreateSessionAuthResolverOptions<TAccount, TSession, TResolved>) => AuthResolver<BearerAuthContext, TResolved>;
export declare const createDevBearerAuthResolver: <TAccount, TResolved>(options: CreateDevBearerAuthResolverOptions<TAccount, TResolved>) => AuthResolver<BearerAuthContext, TResolved>;
export declare const createHeaderProfileAuthResolver: <TProfile, TAccount, TResolved>(options: CreateHeaderProfileAuthResolverOptions<TProfile, TAccount, TResolved>) => AuthResolver<BearerAuthContext, TResolved>;
export declare const resolveRequiredWithAuthResolvers: <TResolved>(authHeader: string | undefined, resolvers: readonly AuthResolver<BearerAuthContext, TResolved>[], invalidMessage?: string) => Promise<TResolved>;
export declare const resolveOptionalWithAuthResolvers: <TResolved>(authHeader: string | undefined, resolvers: readonly AuthResolver<BearerAuthContext, TResolved>[], invalidMessage?: string) => Promise<TResolved | null>;
export declare const createRequiredAuthHandler: <TRequest, TResponse, TResolved>(options: AuthRequestHandlerFactoryOptions<TRequest, TResponse, TResolved>, handler: RequiredAuthHandler<TRequest, TResponse, TResolved>) => ((request: TRequest, response: TResponse) => Promise<void>);
export declare const createOptionalAuthHandler: <TRequest, TResponse, TResolved>(options: AuthRequestHandlerFactoryOptions<TRequest, TResponse, TResolved>, handler: OptionalAuthHandler<TRequest, TResponse, TResolved>) => ((request: TRequest, response: TResponse) => Promise<void>);
