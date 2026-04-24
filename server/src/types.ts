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

// Opaque handle for a config descriptor defined via `defineConfig`. The
// concrete `ConfigDescriptor<S>` type lives in `@plugins/config/shared`.
// biome-ignore lint/suspicious/noExplicitAny: descriptor is type-erased here.
export type ConfigDescriptorLike = { schema: Record<string, any> };

export interface ServerPluginDefinition {
  id: string;
  name: string;
  description?: string;
  httpRoutes?: Record<string, HttpHandler>;
  wsRoutes?: Record<string, WsHandler>;
  /** Live-state resources declared via `defineResource`. */
  resources?: ResourceLike[];
  /** Config descriptor declared via `defineConfig` (plugins/config/shared). */
  config?: ConfigDescriptorLike;
  /**
   * Called once after `runMigrations()` completes. Use this for background
   * work (pollers, watchers) that issues DB queries — scheduling it from the
   * plugin's module body races the migration runner.
   */
  onReady?: () => void | Promise<void>;
  /**
   * Called once on SIGTERM/SIGINT before the process exits. Use this to drain
   * background workers, flush buffered state, and release DB connections.
   * Run in parallel across plugins (same contract as `onReady`); rejections
   * are logged but do not block other plugins' shutdown.
   */
  onShutdown?: () => void | Promise<void>;
}
