import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";
import type { DocMeta } from "@plugins/framework/plugins/web-sdk/core";

export interface Contribution {
  slot: string;
  props: Record<string, string>;
  /**
   * The id of the pane a `Pane.Register` contribution registers — filled in
   * `relate()`, never in `extract()`, because the answer is not local to the
   * registering plugin: a pane's identity lives on a `defineRoute()` that
   * routinely sits in ANOTHER plugin's `core/`, and a barrel can register a pane
   * imported from another plugin's `web/` (settings/accounts registers `auth`'s
   * `accountsPane`). Unset when the reference cannot be resolved from source.
   */
  paneId?: string;
  /**
   * The id of the plugin that *defines* the slot this contribution targets —
   * the owner of `slot`'s group name, filled in `relate()` from the slots
   * facet. Lets the detail UI link a contribution back to its slot definer.
   * Unset when the slot is self-defined or its owner can't be resolved.
   */
  definerPluginId?: string;
}

/**
 * A `defineRoute()` declaration found in this plugin's `core/`, `shared/` or
 * `web/`. The route's `id` IS the pane id of every pane defined on it, so this
 * is what a route-form `Pane.define({ route })` resolves through.
 */
export interface RouteDeclaration {
  /** The `const` binding the route is declared under. */
  name: string;
  /** The route's `id` field. */
  routeId: string;
}

/**
 * A reference to a value that may live in another plugin — one half of a join
 * `relate()` completes with the whole tree in scope.
 */
export interface SourceRef {
  /** The name the value is EXPORTED under at its source (import alias resolved). */
  name: string;
  /**
   * The specifier the name was imported from: `@plugins/<path>/<runtime>` when
   * it crosses a plugin, a relative path when it does not. Absent when the name
   * is declared in the referring file itself.
   */
  module?: string;
}

/** A `Pane.define()` found in this plugin's `web/`. */
export interface PaneDeclaration {
  /** The `const` binding the pane is declared under — what `Pane.Register({ pane })` names. */
  name: string;
  /**
   * Legacy identity: a literal `id:` on the `Pane.define` call itself. Dies with
   * the legacy segment form of `Pane.define`, which has no `id` field.
   */
  id?: string;
  /** Route identity: the `route:` argument, resolved against `routes` in `relate()`. */
  route?: SourceRef;
}

export interface DocMetaContribution {
  /** "slot" = web slot contribution (`_slot`); "server" = server registration (`_kind`). */
  kind: "slot" | "server";
  slotId: string;
  slotDisplayName?: string;
  componentName?: string;
  doc: DocMeta;
  /**
   * The contribution's own `id` field, when present. Combined with `pluginId`
   * this yields the stable reorder `entryKey` (`pluginId ? `${pluginId}:${id}` :
   * id`). Raw — not computed here; consumers build the catalog key.
   */
  id?: string;
  /**
   * The id of the plugin that authored this contribution — the owning node's
   * `id`, filled in `relate()`. Equals the runtime `_pluginId` (`p.id`), so
   * `${pluginId}:${id}` matches the runtime reorder `entryKey()`. Always set for
   * runtime contributions (only optional structurally).
   */
  pluginId?: string;
}

export interface ContributionsFacetData {
  static: Contribution[];
  runtime: DocMetaContribution[];
  /**
   * Join inputs for `relate()`: what this plugin declares locally, before the
   * cross-plugin lookups that turn a `Pane.Register` into a pane id. Both are
   * purely local facts, which is what lets `extract()` stay per-plugin.
   */
  panes: PaneDeclaration[];
  routes: RouteDeclaration[];
  /**
   * The web barrel's imports of the variables its `Pane.Register({ pane })`
   * calls name, keyed by the local name as written. A pane variable absent here
   * is declared in this plugin's own `web/`.
   */
  paneRefs: Record<string, SourceRef>;
}

export const contributionsFacetDef =
  defineFacet<ContributionsFacetData>("contributions");
