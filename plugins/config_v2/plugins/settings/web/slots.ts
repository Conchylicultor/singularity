import type { ComponentType } from "react";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * Which of the two config-detail conflict banners is hosting the action.
 *
 * - `hash` — upstream defaults moved under the user's override; the app runs
 *   the upstream values until the user reconciles.
 * - `invalid` — the stored document no longer validates against the current
 *   schema; the app runs the code defaults.
 */
export type ConfigConflictKind = "hash" | "invalid";

/** conflict = both sides changed it differently; upstream-changed = only upstream moved; unchanged = identical. */
export type ConfigConflictFieldStatus =
  "conflict" | "upstream-changed" | "unchanged";

export interface ConfigConflictField {
  key: string;
  label?: string;
  description?: string;
  /** The user's own override value (what the editor binds to). */
  mine: unknown;
  /** The origin/upstream value the app currently resolves to. */
  upstream: unknown;
  status: ConfigConflictFieldStatus;
}

/**
 * Everything a contributed conflict action needs to describe the conflict it
 * sits on, WITHOUT reading config_v2's resources itself: which descriptor, which
 * scope, which kind of breakage, and the per-field classification the banner
 * already computed.
 *
 * The banner supplies it whole and the contribution is pure over it — which is
 * what lets the tasks stack stay out of the generic config editor.
 */
export interface ConfigConflictContext {
  storePath: string;
  /** Human label for this config — the owning plugin's leaf name, as the nav shows it. */
  name: string;
  /** undefined = the base scope. */
  scopeId?: string;
  kind: ConfigConflictKind;
  /** Every field of the descriptor, classified. */
  fields: ConfigConflictField[];
  /** kind === "invalid" only: schema issues with the path pre-joined ("items.6" / "(root)"). */
  issues?: { path: string; message: string }[];
  /**
   * The hosting banner's own button tint — spread on the contributed trigger so
   * contributed actions match the banner they sit in (warning vs destructive).
   */
  actionClassName: ClassName;
}

export const ConfigDetailSlots = {
  /**
   * Extra actions inside a conflict banner, rendered leftmost — the "get help"
   * end of the row, ahead of the decisive Merge / Accept / Reset resolutions.
   */
  ConflictAction: defineRenderSlot<{
    component: ComponentType<{ conflict: ConfigConflictContext }>;
  }>(),
};
