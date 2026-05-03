import { trimTrailingSlashes } from "./index.js";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export type ApiErrorMessageResolver = (body: JsonObject | null, response: Response) => string;

export interface BrowserApiClientOptions {
  apiBases: readonly string[];
  fetchImpl?: typeof fetch;
  resolveErrorMessage?: ApiErrorMessageResolver;
}

export interface BrowserApiClient {
  readonly apiBases: readonly string[];
  buildUrl(path: string, base: string): string;
  fetchWithFailover(path: string, init?: RequestInit): Promise<Response>;
  parseJsonBodySafe<T>(response: Response): Promise<T | null>;
  requestOptionalJson<T>(path: string, init?: RequestInit): Promise<T | null>;
  requestJson<T>(path: string, init?: RequestInit): Promise<T>;
  requestOptionalJsonWithBearer<T>(path: string, accessToken: string, init?: RequestInit): Promise<T | null>;
  requestJsonWithBearer<T>(path: string, accessToken: string, init?: RequestInit): Promise<T>;
  resolveWebSocketBase(): string;
}

export const parseConfiguredBases = (value: string | number | boolean | null | undefined): string[] => {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const resolveBrowserApiBases = (options: {
  configuredBases?: readonly string[] | undefined;
  localApiPort?: string | number | undefined;
  location?: Pick<Location, "protocol" | "hostname" | "port"> | undefined;
} = {}): string[] => {
  if (options.configuredBases && options.configuredBases.length > 0) {
    return [...options.configuredBases];
  }

  const location = options.location ?? (typeof window === "undefined" ? undefined : window.location);
  if (!location) {
    return [""];
  }

  const apiPort = String(options.localApiPort ?? "4001");
  if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.port !== apiPort) {
    return [`${location.protocol}//${location.hostname}:${apiPort}`, ""];
  }

  return [""];
};

export const buildApiUrl = (path: string, base: string): string => {
  if (!base) {
    return path;
  }

  const normalizedBase = trimTrailingSlashes(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const defaultResolveErrorMessage: ApiErrorMessageResolver = (body, response) => {
  return typeof body?.["error"] === "string" && body["error"].trim().length > 0
    ? body["error"]
    : `HTTP ${response.status}`;
};

export const createBrowserApiClient = (options: BrowserApiClientOptions): BrowserApiClient => {
  const apiBases = [...options.apiBases];
  const fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  const resolveErrorMessage = options.resolveErrorMessage ?? defaultResolveErrorMessage;

  const parseJsonBodySafe = async <T>(response: Response): Promise<T | null> => {
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  };

  const fetchWithFailover = async (path: string, init?: RequestInit): Promise<Response> => {
    let lastResponse: Response | null = null;
    let lastError: Error | null = null;

    for (const base of apiBases) {
      const url = buildApiUrl(path, base);
      try {
        const response = await fetchImpl(url, init);
        if (response.status >= 500 && response.status <= 599) {
          lastResponse = response;
          continue;
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastResponse) {
      return lastResponse;
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`Failed to reach API for ${path}`);
  };

  const requestOptionalJson = async <T>(path: string, init?: RequestInit): Promise<T | null> => {
    const response = await fetchWithFailover(path, init);
    const body = await parseJsonBodySafe<JsonObject>(response);

    if (!response.ok) {
      throw new Error(resolveErrorMessage(body, response));
    }

    return body as T | null;
  };

  const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const body = await requestOptionalJson<T>(path, init);

    if (!body) {
      throw new Error(`Empty response body from ${path}`);
    }

    return body;
  };

  const requestOptionalJsonWithBearer = async <T>(path: string, accessToken: string, init?: RequestInit): Promise<T | null> => {
    return requestOptionalJson<T>(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  };

  const requestJsonWithBearer = async <T>(path: string, accessToken: string, init?: RequestInit): Promise<T> => {
    return requestJson<T>(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  };

  const resolveWebSocketBase = (): string => {
    const apiBase = apiBases.find((base) => base.length > 0);
    const origin = apiBase || window.location.origin;
    return trimTrailingSlashes(origin.replace(/^http/u, "ws"));
  };

  return {
    apiBases,
    buildUrl: buildApiUrl,
    fetchWithFailover,
    parseJsonBodySafe,
    requestOptionalJson,
    requestJson,
    requestOptionalJsonWithBearer,
    requestJsonWithBearer,
    resolveWebSocketBase,
  };
};

export type RealtimeConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface ReconnectingWebSocketOptions<TMessage, TState extends string = RealtimeConnectionState> {
  createUrl: () => string;
  enabled?: boolean;
  reconnect?: boolean;
  maxDelayMs?: number;
  initialState?: TState;
  reconnectingState?: TState;
  connectedState?: TState;
  disconnectedState?: TState;
  disabledState?: TState;
  onConnectionChange?: (state: TState) => void;
  onOpen?: (socket: WebSocket) => void;
  onMessage: (message: TMessage, socket: WebSocket) => void;
  parseMessage?: (raw: MessageEvent["data"]) => TMessage;
}

export const subscribeToReconnectingWebSocket = <TMessage, TState extends string = RealtimeConnectionState>(
  options: ReconnectingWebSocketOptions<TMessage, TState>,
): (() => void) => {
  if (options.enabled === false) {
    if (options.disabledState) {
      options.onConnectionChange?.(options.disabledState);
    }
    return () => undefined;
  }

  const reconnect = options.reconnect !== false;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const initialState = options.initialState ?? ("connecting" as TState);
  const reconnectingState = options.reconnectingState ?? ("reconnecting" as TState);
  const connectedState = options.connectedState ?? ("connected" as TState);
  const disconnectedState = options.disconnectedState ?? ("disconnected" as TState);
  const parseMessage = options.parseMessage ?? ((raw: MessageEvent["data"]) => JSON.parse(String(raw)) as TMessage);

  let socket: WebSocket | null = null;
  let active = true;
  let retryCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const connect = (): void => {
    if (!active) {
      return;
    }

    options.onConnectionChange?.(retryCount === 0 ? initialState : reconnectingState);
    socket = new WebSocket(options.createUrl());

    socket.addEventListener("open", () => {
      retryCount = 0;
      options.onConnectionChange?.(connectedState);
      if (socket) {
        options.onOpen?.(socket);
      }
    });

    socket.addEventListener("message", (event) => {
      if (!socket) {
        return;
      }

      try {
        options.onMessage(parseMessage(event.data), socket);
      } catch {
        // Malformed realtime payloads should not break the subscription loop.
      }
    });

    socket.addEventListener("close", () => {
      if (!active || !reconnect) {
        options.onConnectionChange?.(disconnectedState);
        return;
      }

      retryCount += 1;
      const delay = Math.min(maxDelayMs, 400 * (2 ** Math.min(retryCount, 5)));
      options.onConnectionChange?.(reconnectingState);
      clearReconnectTimer();
      reconnectTimer = setTimeout(connect, delay);
    });

    socket.addEventListener("error", () => {
      // The close event owns reconnect behavior.
    });
  };

  connect();

  return () => {
    active = false;
    clearReconnectTimer();
    options.onConnectionChange?.(disconnectedState);
    socket?.close();
  };
};