import { Client, Session } from "@heroiclabs/nakama-js";

const CRED_PREFIX = "nk1.";

export function isNakamaBackend(): boolean {
  const flag = String(import.meta.env.VITE_PAZAAK_BACKEND ?? "").toLowerCase().trim();
  if (flag === "nakama") return true;
  if (flag === "legacy" || flag === "worker" || flag === "http") return false;
  return Boolean(String(import.meta.env.VITE_NAKAMA_HOST ?? "").trim());
}

function nakamaHost(): string {
  return String(import.meta.env.VITE_NAKAMA_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
}

function nakamaPort(): string {
  return String(import.meta.env.VITE_NAKAMA_PORT ?? "7350").trim() || "7350";
}

function nakamaServerKey(): string {
  return String(import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey").trim() || "defaultkey";
}

function nakamaUseSsl(): boolean {
  const raw = String(import.meta.env.VITE_NAKAMA_USE_SSL ?? "").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes";
}

let clientSingleton: Client | null = null;

export function getNakamaClient(): Client {
  if (!clientSingleton) {
    clientSingleton = new Client(nakamaServerKey(), nakamaHost(), nakamaPort(), nakamaUseSsl());
  }
  return clientSingleton;
}

export function encodeNakamaCredential(session: Session): string {
  const payload = JSON.stringify({ t: session.token, r: session.refresh_token });
  return CRED_PREFIX + btoa(payload);
}

export function tryDecodeNakamaCredential(accessToken: string): Session | null {
  if (!accessToken.startsWith(CRED_PREFIX)) return null;
  try {
    const parsed = JSON.parse(atob(accessToken.slice(CRED_PREFIX.length))) as { t?: string; r?: string };
    if (typeof parsed.t === "string" && typeof parsed.r === "string") {
      return Session.restore(parsed.t, parsed.r);
    }
  } catch {
    return null;
  }
  return null;
}

export async function ensureNakamaSession(
  accessToken: string,
  username: string,
  stableAccountId: string,
): Promise<Session> {
  const decoded = tryDecodeNakamaCredential(accessToken);
  if (decoded) {
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.isexpired(now)) return decoded;
    return getNakamaClient().sessionRefresh(decoded);
  }

  const client = getNakamaClient();
  const guestLike = accessToken.startsWith("local-guest-token:") || accessToken.startsWith("dev-user-");
  if (guestLike) {
    return client.authenticateDevice(stableAccountId, true, username);
  }
  return client.authenticateCustom(`openkotor:${stableAccountId}`, true, username);
}

export interface ActivitySessionLike {
  userId: string;
  username: string;
  accessToken: string;
}

export async function bootstrapNakamaActivitySession(activity: ActivitySessionLike): Promise<ActivitySessionLike> {
  if (!isNakamaBackend()) return activity;
  const session = await ensureNakamaSession(activity.accessToken, activity.username, activity.userId);
  const userId = session.user_id ?? activity.userId;
  return {
    ...activity,
    userId,
    accessToken: encodeNakamaCredential(session),
  };
}

export async function sessionFromPazaakAccessToken(accessToken: string): Promise<Session> {
  const decoded = tryDecodeNakamaCredential(accessToken);
  if (!decoded) {
    throw new Error("Missing Nakama session. Reload and sign in again.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!decoded.isexpired(now)) return decoded;
  return getNakamaClient().sessionRefresh(decoded);
}

export async function nakamaRpc<T extends object>(accessToken: string, rpcId: string, payload: object): Promise<T> {
  const session = await sessionFromPazaakAccessToken(accessToken);
  const res = await getNakamaClient().rpc(session, rpcId, payload);
  return (res.payload ?? {}) as T;
}
