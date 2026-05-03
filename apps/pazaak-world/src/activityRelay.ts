import { subscribeToReconnectingWebSocket } from "@openkotor/platform/browser";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ActivityRelaySession {
  userId: string;
  username: string;
  instanceId?: string;
}

export interface ActivityRelayMember {
  userId: string;
  username: string;
  seat: number;
  color: string;
}

export type ActivityRelayConnectionState = "disabled" | "connecting" | "connected" | "reconnecting" | "disconnected";

export interface ActivityRelayOptions {
  onConnectionChange?: (state: ActivityRelayConnectionState) => void;
  onPresence?: (members: ActivityRelayMember[]) => void;
  reconnect?: boolean;
  maxDelayMs?: number;
}

type ActivityRelayMessage =
  | { type: "welcome"; userId: string; instanceId: string; seat: number; color: string }
  | { type: "presence"; members: ActivityRelayMember[] }
  | { type: "pong"; at: number }
  | { type: "error"; reason: string }
  | { type: "relay"; from: { userId: string; username: string }; payload: JsonValue };

const configuredRelayUrl = String(import.meta.env.VITE_ACTIVITY_RELAY_URL ?? "").trim();

function buildRelayUrl(instanceId: string): string {
  const base = configuredRelayUrl.replace(/\/+$/u, "");
  return `${base}/${encodeURIComponent(instanceId)}`;
}

export function subscribeToActivityRelay(session: ActivityRelaySession, options: ActivityRelayOptions = {}): () => void {
  const instanceId = session.instanceId;
  return subscribeToReconnectingWebSocket<ActivityRelayMessage, ActivityRelayConnectionState>({
    enabled: Boolean(configuredRelayUrl && instanceId),
    disabledState: "disabled",
    createUrl: () => buildRelayUrl(instanceId ?? ""),
    reconnect: options.reconnect,
    maxDelayMs: options.maxDelayMs,
    onConnectionChange: options.onConnectionChange,
    onOpen: (socket) => {
      socket.send(JSON.stringify({
        type: "join",
        instanceId: instanceId ?? "",
        userId: session.userId,
        username: session.username,
      }));
    },
    onMessage: (message) => {
      if (message.type === "presence") {
        options.onPresence?.(message.members);
      }
    },
  });
}
