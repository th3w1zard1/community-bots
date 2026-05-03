import { normalizeOrigin } from "./index.js";

export const DEFAULT_LOCAL_WEB_PORTS = [3000, 4173, 5173] as const;

export interface BuildBrowserCorsAllowedOriginsOptions {
  discordAppId?: string;
  activityOrigin?: string | undefined;
  publicWebOrigin?: string | undefined;
  localPorts?: readonly (string | number)[] | undefined;
}

export interface CorsResolutionOptions {
  allowMethods?: string;
  allowHeaders?: string;
}

export interface CorsRequestLike {
  method: string;
  origin?: string | null | undefined;
}

export interface CorsResolution {
  headers: Record<string, string>;
  isPreflight: boolean;
}

export const buildLocalWebOrigins = (ports: readonly (string | number)[] = DEFAULT_LOCAL_WEB_PORTS): string[] => {
  return ports.flatMap((port) => {
    const normalizedPort = String(port).trim();
    if (!normalizedPort) {
      return [];
    }

    return [
      `http://localhost:${normalizedPort}`,
      `http://127.0.0.1:${normalizedPort}`,
    ];
  });
};

export const buildBrowserCorsAllowedOrigins = (options: BuildBrowserCorsAllowedOriginsOptions): string[] => {
  return [
    options.discordAppId ? `https://${options.discordAppId}.discordsays.com` : undefined,
    ...buildLocalWebOrigins(options.localPorts),
    normalizeOrigin(options.activityOrigin),
    normalizeOrigin(options.publicWebOrigin),
  ].filter((origin): origin is string => Boolean(origin));
};

export const resolveCorsHeaders = (
  request: CorsRequestLike,
  allowedOrigins: readonly string[],
  options: CorsResolutionOptions = {},
): CorsResolution => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": options.allowMethods ?? "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": options.allowHeaders ?? "Content-Type,Authorization",
    Vary: "Origin",
  };

  const origin = request.origin ?? "";
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return {
    headers,
    isPreflight: request.method.toUpperCase() === "OPTIONS",
  };
};