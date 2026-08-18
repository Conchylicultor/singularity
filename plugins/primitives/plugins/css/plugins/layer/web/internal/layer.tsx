import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  type InTreeLayer,
  zLayerClass,
} from "@plugins/primitives/plugins/css/plugins/z-layers/web";
import type React from "react";

/** What a caller may say about a full-bleed layer. Both halves are optional —
 *  {@link layerClasses} owns the defaults. */
export interface LayerOptions {
  /** Stacking level among siblings, from the z-layer scale. Defaults to `base`
   *  — a full-bleed layer's paint order is normally its DOM order. */
  layer?: InTreeLayer;
  /** Make the layer click-through (`pointer-events-none`) — a wallpaper, a
   *  scrim, a gradient that must never eat a click. Defaults to false. */
  decorative?: boolean;
}

/**
 * The pure layer class map — single source of truth, exported so the component
 * and the pure test share one definition.
 *
 * A full-bleed layer is exactly `absolute inset-0` plus its stacking level: it
 * takes its whole box from the nearest positioned ancestor and contributes no
 * size of its own. There is no `offset` / partial-inset axis on purpose — every
 * corpus site is exactly `inset-0`, and a layer that only covers part of its
 * parent is a point anchor, which is `<Pin>`.
 *
 * **The defaults live HERE, not in `<Layer>`** — the component forwards its
 * props through untouched. This is a deliberate divergence from
 * `pinClasses`/`<Pin>`, which declares each default twice (once in the
 * destructuring, once in the prop docs) and so can drift. One home, one value.
 */
export function layerClasses(opts: LayerOptions = {}): string {
  const { layer = "base", decorative = false } = opts;
  return [
    "absolute inset-0",
    zLayerClass(layer),
    decorative ? "pointer-events-none" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface LayerProps
  extends LayerOptions, React.HTMLAttributes<HTMLElement> {
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Clip/Fill/Pin). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * The sanctioned full-bleed layer — one `absolute inset-0` child of a
 * caller-owned positioned parent.
 *
 * Sibling of `<Overlay>`, NOT a replacement: Overlay takes its layers as
 * *props* (`behind`/`above`) around required in-flow `children`, so it can only
 * express "a box with layers painted around its content". It cannot express a
 * layer that IS an element (a full-bleed `<img>` wallpaper), or one that is a
 * plain sibling in a list of layers, or a positioning host whose whole job is to
 * be the layer. That shape is this primitive, and it is what ~19 call sites
 * wrote by hand with the reason "not an Overlay wrapping content".
 *
 * It is also the `<Pin>` complement: Pin is the *point* anchor (a corner, an
 * edge-center), Layer is the *full-bleed* one. Neither establishes the
 * positioning context — the parent does (`relative` is not banned), and an
 * absolutely-positioned `<Layer>` is itself the containing block for its own
 * children.
 *
 * **Reach for {@link layerClasses} rather than this component whenever you do
 * not own the element**: a raw `<img>`/`<svg>`/`<button>`/`<textarea>` leaf that
 * must ITSELF be the layer, or a third-party component exposing only a
 * `className`. Own the element ⇒ `<Layer>`; don't ⇒ the helper.
 *
 * Caller `className` composes last.
 */
export function Layer({
  layer,
  decorative,
  as: As = "div",
  ref,
  className,
  children,
  ...rest
}: LayerProps) {
  return (
    <As
      ref={ref}
      className={cn(layerClasses({ layer, decorative }), className)}
      {...rest}
    >
      {children}
    </As>
  );
}
