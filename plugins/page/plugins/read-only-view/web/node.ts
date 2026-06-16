/**
 * A renderable block node for the read-only renderer.
 *
 * This is `SerializedBlock` (the editor's portable, id-less block shape) plus an
 * **optional `id`** — the single addition this layer needs. `SerializedBlock`
 * carries no id, but the diff map (§3 of the version-history plan) is keyed by
 * stable block id. So the consumer builds a `ReadOnlyNode` forest from its stored
 * rows (which DO have ids) and passes the ids through; the renderer matches each
 * node against `diff` by its `id`.
 *
 * A plain `SerializedBlock[]` is assignable to `ReadOnlyNode[]` (the extra `id`
 * is optional), so callers with no ids — Story lenses, a paste preview — can pass
 * a serialized forest directly and simply get no diff highlighting.
 */
export interface ReadOnlyNode {
  /** Stable block id, used only to look the node up in the `diff` map. */
  id?: string;
  type: string;
  /** Block payload; treated as `{}` when absent (matches `SerializedBlock`). */
  data?: unknown;
  /** Whether a collapsible block shows its children. Read-only always renders expanded. */
  expanded: boolean;
  children: ReadOnlyNode[];
}

/** Per-block diff classification, keyed by block id. */
export type BlockDiffKind = "added" | "removed" | "modified";
