import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

/** How a cross-plugin dependency binds: a hard `import` (mandatory) or a soft
 *  slot `contribution` (prunable). */
export type EdgeKind = "hard" | "soft";

/** One directed cross-plugin edge `from → to` of a given kind. */
export interface Edge {
  from: PluginId;
  to: PluginId;
  kind: EdgeKind;
}

/**
 * The cross-plugin dependency graph, both directions, kind-separated and indexed.
 *
 * Every tree node is a key in all four maps (possibly with an empty array) so
 * callers never branch on `undefined`. The fixpoint reads only the maps; `edges`
 * is the derived flat list for explain/tests/future visualization.
 */
export interface EdgeGraph {
  /** A → barrels A hard-imports. */
  hardForward: Map<PluginId, PluginId[]>;
  /** B → who hard-imports B. */
  hardReverse: Map<PluginId, PluginId[]>;
  /** A → owners of the slot groups A contributes to. */
  softForward: Map<PluginId, PluginId[]>;
  /** B → contributors into the slot groups B owns. */
  softReverse: Map<PluginId, PluginId[]>;
  /**
   * Node → all descendant ids (its proper subtree). NOT a dependency edge:
   * containment is applied only at *entry seeding* — selecting an umbrella as an
   * entry ships its whole subtree — never as a transitive import edge. (Importing
   * an umbrella's barrel does not pull in its children.)
   */
  subtree: Map<PluginId, PluginId[]>;
  /** Flat derived list of every edge (hard then soft). */
  edges: Edge[];
}

/**
 * A named, conservative selection over the plugin space. `entryPoints` are the
 * explicitly-included plugins (an umbrella entry implies its whole subtree).
 * `selectedContributors` are the soft contributors a human/agent has explicitly
 * opted IN — reviewed options pulled into the bundle. Default `[]` ⇒ the bundle
 * is the pure hard closure of the entries; NOTHING soft is included by default.
 */
export interface CompositionManifest {
  name: string;
  entryPoints: PluginId[];
  selectedContributors: PluginId[];
}

export type MembershipState =
  /** Explicitly in entryPoints. */
  | "entry"
  /** In hardClosure(entrySeeds) — locked, NOT removable. */
  | "required"
  /** A selected contributor that's in the bundle (not entry/required). */
  | "contributor"
  /** In the bundle only via a selected contributor's hard closure. */
  | "via-contributor"
  /** Not in the bundle, but soft-contributes to it — a reviewable option. */
  | "available"
  /** Not in the bundle and not a reviewable option. */
  | "excluded";

export interface Composition {
  bundle: Set<PluginId>;
  /** Total: every tree node maps to a state, default `"excluded"`. */
  membership: Map<PluginId, MembershipState>;
  /** The reviewable option frontier: ids not in the bundle that soft-contribute to
   *  some bundled member. Sorted, deduped. These carry membership `"available"`. */
  available: PluginId[];
  /** selectedContributors that are also entry/required → already locked in by hard
   *  edges, so the selection is a no-op worth surfacing. */
  redundantSelections: PluginId[];
}

/** One hop in an inclusion explanation. */
export interface InclusionStep {
  from: PluginId;
  to: PluginId;
  kind: EdgeKind;
}

/** Why a given target plugin is in the bundle: the seed it originates from and
 *  the shortest chain of edges that pulls it in. */
export interface InclusionPath {
  target: PluginId;
  state: MembershipState;
  origin: PluginId;
  originKind: "entry" | "contributor";
  steps: InclusionStep[];
}
