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

export type ResourceLike = { key: string };

export interface CentralPluginDefinition {
  id: string;
  name: string;
  description?: string;
  httpRoutes?: Record<string, HttpHandler>;
  wsRoutes?: Record<string, WsHandler>;
  resources?: ResourceLike[];
  onReady?: () => void | Promise<void>;
  onShutdown?: () => void | Promise<void>;
}
