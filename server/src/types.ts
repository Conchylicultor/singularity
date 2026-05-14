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

export type { DocMeta } from "@plugins/framework/plugins/web-sdk/core";

import type { DocMeta } from "@plugins/framework/plugins/web-sdk/core";

/**
 * A lazy registry write. Returned by helpers like `Mcp.tool`, `Runtime.define`,
 * `defineJob`, `defineTriggerEvent`, and `UNSAFE_installDurableHooks`. The
 * framework walks `plugin.register: Registration[]` during the register phase
 * and invokes `.register()` on each token in topo-sorted order.
 *
 * Dual-purpose factories (`defineJob`, `defineTriggerEvent`'s `event` field)
 * implement Registration alongside their public API on the same object —
 * `const dispatchJob = defineJob({...})` exposes `.enqueue` (factory role)
 * and `.register()` (framework hook).
 */
export interface Registration {
  register(): void | Promise<void>;
  /** Auto-set by the factory (e.g. "mcp-tool", "job"). Never manually specified. */
  readonly _kind?: string;
  /** Factory function name for docgen display (e.g. "defineJob", "mcpTool"). Auto-set. */
  readonly _factory?: string;
  _doc?: DocMeta;
}

export type { ServerContribution, ServerContributionToken } from "./contributions";

export interface ServerPluginDefinition {
  id: string;
  name: string;
  description?: string;
  /**
   * Marks the plugin as critical core infrastructure. See
   * `PluginDefinition.loadBearing` in `plugin-core/types.ts` for semantics.
   */
  loadBearing?: boolean;
  httpRoutes?: Record<string, HttpHandler>;
  wsRoutes?: Record<string, WsHandler>;
  /**
   * Plugins this plugin's `register` array must run after. Most plugins need
   * this empty: phase ordering (all `register` writes before any `onReady`)
   * handles the registry-host case automatically. Use only when this
   * plugin's `register` tokens read state another plugin's `register` tokens
   * produced.
   */
  dependsOn?: ServerPluginDefinition[];
  /**
   * Lazy registry-write tokens applied at boot before `runMigrations()` and
   * `onReady()`. The only place a plugin writes to global registries
   * (`Mcp.tool`, `Runtime.define`, `defineJob`, `defineTriggerEvent`,
   * `UNSAFE_installDurableHooks`). Each token's `.register()` is called
   * sequentially in topo-sorted order, so registries are fully populated
   * before `onReady()` fires. No I/O, no DB queries — those belong in
   * `onReady`.
   */
  register?: Registration[];
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
  contributions?: import("./contributions").ServerContribution[];
}
