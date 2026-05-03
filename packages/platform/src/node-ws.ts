import type http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

type SerializableValue = object | string | number | boolean | null;

export interface JsonWebSocketSubscription<TStream extends string> {
  stream: TStream;
  topicId: string;
}

interface JsonWebSocketClient<TStream extends string> extends JsonWebSocketSubscription<TStream> {
  ws: WebSocket;
}

export interface JsonWebSocketHubOptions<TStream extends string> {
  server: http.Server;
  path?: string;
  resolveSubscription: (url: URL) => JsonWebSocketSubscription<TStream>;
}

export class JsonWebSocketHub<TStream extends string> {
  private readonly clients = new Set<JsonWebSocketClient<TStream>>();
  private readonly wss: WebSocketServer;

  public constructor(options: JsonWebSocketHubOptions<TStream>) {
    this.wss = new WebSocketServer({ server: options.server, path: options.path ?? "/ws" });

    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const subscription = options.resolveSubscription(url);
      const entry: JsonWebSocketClient<TStream> = { ws, ...subscription };
      this.clients.add(entry);

      ws.on("close", () => {
        this.clients.delete(entry);
      });

      ws.on("error", () => {
        this.clients.delete(entry);
      });
    });
  }

  public broadcastWhere(predicate: (client: JsonWebSocketSubscription<TStream>) => boolean, type: string, data: SerializableValue): void {
    const payload = JSON.stringify({ type, data });

    for (const client of this.clients) {
      if (predicate(client)) {
        this.sendPayload(client.ws, payload);
      }
    }
  }

  public broadcastToStream(stream: TStream, type: string, data: SerializableValue): void {
    this.broadcastWhere((client) => client.stream === stream, type, data);
  }

  public broadcastToTopic(stream: TStream, topicId: string, type: string, data: SerializableValue): void {
    this.broadcastWhere((client) => client.stream === stream && client.topicId === topicId, type, data);
  }

  private sendPayload(ws: WebSocket, payload: string): void {
    if (ws.readyState !== ws.OPEN) {
      return;
    }

    try {
      ws.send(payload);
    } catch {
      // Close/error handlers prune broken sockets.
    }
  }
}

export class InMemoryTopicMessageStore<TMessage> {
  private readonly messages = new Map<string, TMessage[]>();

  public constructor(private readonly limit = 100) {}

  public append(topicId: string, message: TMessage): void {
    const history = this.messages.get(topicId) ?? [];
    history.push(message);
    if (history.length > this.limit) {
      history.splice(0, history.length - this.limit);
    }
    this.messages.set(topicId, history);
  }

  public list(topicId: string): TMessage[] {
    return this.messages.get(topicId) ?? [];
  }
}