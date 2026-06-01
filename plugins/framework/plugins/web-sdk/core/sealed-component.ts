import type { ComponentType } from "react";

declare const SEALED: unique symbol;

/** Opaque, non-renderable component handle returned by useContributions(). */
export type SealedComponent<P = unknown> = {
  readonly [SEALED]: true;
  readonly __props?: P;
};

/** Maps a contribution's `component: ComponentType<X>` field → SealedComponent<X>;
 *  every other field is untouched (so `id`, `order`, `match`, `icon`, … stay readable). */
export type SealContributions<P> = {
  [K in keyof P]: K extends "component"
    ? P[K] extends ComponentType<infer Props>
      ? SealedComponent<Props>
      : P[K]
    : P[K];
};

/** UNSAFE: returns a raw, NON-isolated component. Only for slots that structurally
 *  cannot route through the middleware chain. Greppable by the UNSAFE_ name. */
export function UNSAFE_unsealSlotComponent<P>(
  s: SealedComponent<P>,
): ComponentType<P> {
  return s as unknown as ComponentType<P>;
}
