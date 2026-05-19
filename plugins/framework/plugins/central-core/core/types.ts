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

/**
 * A lazy registry write. Same semantics as `ServerPluginDefinition`'s
 * `Registration`. See `server/src/types.ts` for the full contract.
 */
export interface Registration {
  register(): void | Promise<void>;
}

export interface CentralPluginDefinition {
  id: string;
  name: string;
  description?: string;
  /** Auto-set by codegen from the plugin's position in the hierarchy tree. */
  _hierarchyPath?: string;
  /**
   * Marks the plugin as critical core infrastructure. See
   * `PluginDefinition.loadBearing` in `plugin-core/types.ts` for semantics.
   */
  loadBearing?: boolean;
  httpRoutes?: Record<string, HttpHandler>;
  wsRoutes?: Record<string, WsHandler>;
  resources?: ResourceLike[];
  /**
   * Plugins this plugin's `register` array must run after. Same semantics as
   * `ServerPluginDefinition.dependsOn`.
   */
  dependsOn?: CentralPluginDefinition[];
  /**
   * Lazy registry-write tokens applied at boot before `onReady()`. Sequential,
   * topo-sorted. Use for registry writes only; no I/O.
   */
  register?: Registration[];
  onReady?: () => void | Promise<void>;
  onShutdown?: () => void | Promise<void>;
}
