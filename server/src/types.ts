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

// Opaque handle for a resource defined via `defineResource`. The concrete
// `Resource<T, P>` type lives in ./resources; kept minimal here to avoid a
// circular import.
export type ResourceLike = { key: string };

export interface ServerPluginDefinition {
  id: string;
  name: string;
  description?: string;
  httpRoutes?: Record<string, HttpHandler>;
  wsRoutes?: Record<string, WsHandler>;
  /** Live-state resources declared via `defineResource`. */
  resources?: ResourceLike[];
  /**
   * Called once after `runMigrations()` completes. Use this for background
   * work (pollers, watchers) that issues DB queries — scheduling it from the
   * plugin's module body races the migration runner.
   */
  onReady?: () => void | Promise<void>;
}
