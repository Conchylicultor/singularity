import type { Registration } from "@plugins/framework/plugins/server-core/core";

// A registered history source. The engine owns the table and the
// list/get/restore wiring; each source owns how its entity serializes to an
// opaque snapshot and how a snapshot is restored back onto the entity.
// Collection-consumer separation: the engine never names a source — sources
// register themselves and the engine looks them up by id.
export interface HistorySource {
  id: string;
  /**
   * Capture the entity's current state as an opaque snapshot. `label`/`author`
   * are optional display metadata stored alongside the version (engine treats
   * the snapshot itself as opaque). Return `null` to decline the snapshot — e.g.
   * the entity was deleted during a debounce window — so the engine skips it
   * cleanly instead of erroring (a snapshot job must not retry on a vanished
   * entity).
   */
  serialize: (entityId: string) => Promise<{
    snapshot: unknown;
    label?: string;
    author?: string;
  } | null>;
  /** Replace the entity's current state with a previously captured snapshot. */
  restore: (entityId: string, snapshot: unknown) => Promise<void>;
}

// Module-load-time registry. Populated by `defineHistorySource`'s `register()`
// during the framework's register phase (mirrors `defineJob`'s `jobRegistry`).
const historySourceRegistry = new Map<string, HistorySource>();

/**
 * Register a history source. Returns a {@link Registration} — a lazy registry
 * write the framework applies when the token sits in a plugin's
 * `register: [...]` array. Mirrors the `defineJob` / `defineResource` shape:
 * the returned object carries the public API (`id`) alongside `register()` plus
 * the `_kind` / `_factory` / `_doc` docgen metadata the framework reads.
 */
export function defineHistorySource(
  source: HistorySource,
): HistorySource & Registration {
  return {
    ...source,
    _kind: "history-source",
    _factory: "defineHistorySource",
    _doc: { label: source.id },
    register() {
      if (historySourceRegistry.has(source.id)) {
        throw new Error(`[history] duplicate history source id: ${source.id}`);
      }
      historySourceRegistry.set(source.id, source);
    },
  };
}

export function getHistorySource(id: string): HistorySource | undefined {
  return historySourceRegistry.get(id);
}
