import type { ServerWebSocket } from "bun";

export interface WsData {
  path: string;
}

export interface WsHandler {
  open(ws: ServerWebSocket<WsData>): void;
  message(ws: ServerWebSocket<WsData>, msg: string | Buffer): void;
  close(ws: ServerWebSocket<WsData>, code: number, reason: string): void;
}

export type HttpHandler = (
  req: Request,
  params: Record<string, string>,
) => Response | Promise<Response>;

// Plugins declare SSE streams as pure subscriber handlers. The core owns the
// single multiplexed /api/events endpoint, response encoding, and heartbeat;
// plugins just emit application-level events via `send`.
export interface SseHandler<T = unknown> {
  subscribe(
    send: (data: T) => void,
    params: Record<string, string>,
  ): () => void;
}

export interface ServerPluginDefinition {
  id: string;
  name: string;
  description?: string;
  httpRoutes?: Record<string, HttpHandler>;
  wsRoutes?: Record<string, WsHandler>;
  sseRoutes?: Record<string, SseHandler>;
}
