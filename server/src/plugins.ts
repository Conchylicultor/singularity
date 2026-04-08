import type { ServerWebSocket } from "bun";

export interface WsData {
  path: string;
}

export interface WsHandler {
  open(ws: ServerWebSocket<WsData>): void;
  message(ws: ServerWebSocket<WsData>, msg: string | Buffer): void;
  close(ws: ServerWebSocket<WsData>, code: number, reason: string): void;
}

// HTTP routes: "METHOD /path" → handler
export const httpRoutes: Record<
  string,
  (req: Request) => Response | Promise<Response>
> = {};

// WebSocket routes: "/path" → handler
export const wsRoutes: Record<string, WsHandler> = {};
