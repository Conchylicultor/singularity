import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

/**
 * Everything the config detail pane knows about the descriptor the user is
 * currently editing, handed to every contributed toolbar action.
 *
 * The pane owns this state (the selected scope is local state; the values /
 * tiers are live-state reads it already gates on), and a contributor has no
 * other way to reach it — which is exactly why the action is a slot with a
 * context rather than a button the pane hard-codes.
 */
export interface ConfigDetailActionContext {
  /**
   * Canonical DOT-form plugin id the descriptor is *stored* under (the slot
   * owner when a registration overrides `pluginId`). Pairs with `configName` as
   * the descriptor's cross-runtime identity.
   */
  pluginId: PluginId;
  /** The descriptor's config name — the on-disk file stem (usually "config"). */
  configName: string;
  /** `<asPath(pluginId)>/<configName>.jsonc` — the config_v2 resource key. */
  storePath: string;
  /** The selected scope tab; `undefined` = Base (no per-app scope). */
  scopeId: string | undefined;
  /** The descriptor's `promotableToGit` opt-in, normalized to a boolean. */
  promotableToGit: boolean;
  /**
   * True when at least one field of the selected scope resolves from the **user
   * layer** (its tier is `"user"`) — i.e. there is a runtime override to act on.
   * Derived from the tiers resource, not from a defaults comparison, so a value
   * that merely matches a git-layer default is not mistaken for a user edit.
   */
  modified: boolean;
  /**
   * The unreconciled conflict on this scope, if any — `"hash"` (upstream
   * defaults moved under the override) or `"invalid"` (the stored document no
   * longer parses). `null` when clean.
   *
   * An action that publishes or exports `value` must consider this: under an
   * `"invalid"` conflict the editor resolves to defaults, so `value` is NOT the
   * user's (unparseable) document.
   */
  conflictKind: "hash" | "invalid" | null;
  /**
   * The full field-map document the editor is currently showing for this scope
   * — the user's override document during a hash conflict, the resolved value
   * otherwise. This is the document an action should act on, because it is the
   * one the user can see.
   */
  value: Record<string, unknown>;
}

export const ConfigDetail = {
  /**
   * Toolbar actions for a single config descriptor's detail pane.
   *
   * A genuinely open set: any plugin may want to act on "the config document
   * currently on screen" (promote it to a git default, export it, copy it,
   * share it) without the settings pane learning about it. `config_v2/settings`
   * stays a pure editor; contributors own their own semantics. The alternative
   * — a closed list in `core/` — would force settings to import staging (and
   * every future actor), which is precisely the collection-consumer coupling
   * the boundary rules forbid.
   */
  Action: defineRenderSlot<{
    component: ComponentType<ConfigDetailActionContext>;
  }>("config-detail.action"),
};
