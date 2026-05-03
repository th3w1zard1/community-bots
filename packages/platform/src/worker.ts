import { extractBearerToken, isWebSocketUpgradeHeader } from "./index.js";

type SerializableValue = object | string | number | boolean | null;

export const createCorsHeaders = (origin = "*"): HeadersInit => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
});

export const jsonResponse = (data: SerializableValue, status = 200, corsHeaders: HeadersInit = createCorsHeaders()): Response => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
};

export const emptyResponse = (status = 204, corsHeaders: HeadersInit = createCorsHeaders()): Response => {
  return new Response(null, { status, headers: corsHeaders });
};

export const errorResponse = (message: string, status = 400, corsHeaders: HeadersInit = createCorsHeaders()): Response => {
  return jsonResponse({ error: message }, status, corsHeaders);
};

export const parseBearerTokenFromHeaders = (headers: Headers): string | null => extractBearerToken(headers.get("authorization"));

export const isWebSocketUpgradeRequest = (request: Request): boolean => isWebSocketUpgradeHeader(request.headers.get("Upgrade"));