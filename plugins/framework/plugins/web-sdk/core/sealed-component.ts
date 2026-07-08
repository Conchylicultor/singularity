import type { ComponentType } from "react";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { DocMeta } from "./types";

declare const SEALED: unique symbol;

/** Opaque, non-renderable component handle returned by useContributions(). */
export type SealedComponent<P = unknown> = {
  readonly [SEALED]: true;
  readonly __props?: P;
};

/**
 * Loader-injected contribution metadata, stamped onto every contribution at
 * runtime by `PluginProvider` (`_pluginId = p.id`, etc.). Sealed contributions
 * carry it too, so a consumer can read the owning plugin id / slot id off a
 * `useContributions()` result — the value exists at runtime; this makes it
 * type-visible. Mirrors the metadata fields on {@link Contribution}.
 */
export interface SealedMeta {
  readonly _slotId?: string;
  readonly _pluginId?: PluginId;
  readonly _pluginDescription?: string;
  readonly _doc?: DocMeta;
}

/** Maps a contribution's `component: ComponentType<X>` field → SealedComponent<X>;
 *  every other declared field is untouched (so `id`, `order`, `match`, `icon`, …
 *  stay readable) and the loader-injected metadata (`_pluginId`, `_slotId`, …)
 *  stays type-visible via {@link SealedMeta}. */
export type SealContributions<P> = {
  [K in keyof P]: K extends "component"
    ? P[K] extends ComponentType<infer Props>
      ? SealedComponent<Props>
      : P[K]
    : P[K];
} & SealedMeta;

/** UNSAFE: returns a raw, NON-isolated component. Only for slots that structurally
 *  cannot route through the middleware chain. Greppable by the UNSAFE_ name. */
export function UNSAFE_unsealSlotComponent<P>(
  s: SealedComponent<P>,
): ComponentType<P> {
  return s as unknown as ComponentType<P>;
}
