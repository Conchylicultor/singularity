import type React from "react";

/**
 * The **open passthrough** — the half of a primitive's props that it does not
 * name, spread onto the element it renders.
 *
 * A primitive opens one so callers can reach the DOM without it having to
 * enumerate every attribute they might want: `data-*` selector targets, `id`,
 * `title`, `style`, pointer / drag handlers, an element-specific `href` or
 * `type`. That is a genuinely useful thing to offer, and it is also a promise:
 *
 * > everything you spread lands on **one node**, and it is the same node
 * > tomorrow.
 *
 * `ref` is declared here, on the passthrough itself, because it is the OTHER
 * half of that same promise. `ref` **names** the node; the bag **addresses**
 * it. A primitive that hands out a bag and no node has not said where the bag
 * goes — not to its callers, and not to the next person to edit it.
 *
 * ## Why the pairing is the whole design
 *
 * `Row` shipped `[key: string]: unknown` documented as "spread onto the
 * rendered element", and rendered one element — right up until it was given
 * `actions`, from which point it rendered a box wrapping a synthesized
 * `<button>`. So a caller's `data-*` moved from the box to the button the day
 * someone added an action, at a call site nobody edited, with no throw, no
 * lint and no type error.
 *
 * The tempting reading of that bug is "a primitive with an open passthrough
 * must render one element". It is the wrong reading: `Badge` and
 * `OverlayPanel` render two apiece and are correct, and `Row` rendered one and
 * was wrong. What actually went wrong is that the bag's destination was never
 * *stated*, so it could move without anyone noticing it had.
 *
 * Anchoring the bag to `ref` states it, and states it in terms a caller can
 * already act on. Growth then sorts itself into two cases, and only one of
 * them is a bug:
 *
 * - Wrapping the anchor in new chrome keeps `ref` and the bag together. The
 *   caller's node is still the caller's node. Nothing to catch.
 * - Moving `ref` to the new wrapper and leaving the bag behind (or the
 *   reverse) splits them. That is the `Row` bug, and it is what
 *   `passthrough/no-unanchored-passthrough` rejects.
 *
 * ## React 19 makes the simple case free
 *
 * `ref` is an ordinary prop for function components, so a primitive that never
 * destructures it — `Badge`, `ToggleChip`, `SurfaceOverlay`, the tab-bar
 * variants — forwards it correctly through the single `{...rest}` it already
 * writes. Extending this type adds the *type*, not the plumbing: the ref was
 * already flowing, untyped and undocumented, through the anonymous index
 * signature.
 *
 * ## Use
 *
 * ```ts
 * export interface BadgeProps extends Passthrough {
 *   variant?: BadgeVariant;
 *   children: React.ReactNode;
 * }
 * ```
 *
 * Pass the element type when the primitive needs a narrower `ref` than
 * `HTMLElement` — a mutable ref is invariant, so `Ref<HTMLDivElement>` is not
 * assignable to `Ref<HTMLElement>` and a bare `extends Passthrough` would be a
 * type error:
 *
 * ```ts
 * export interface OverlayPanelProps extends Passthrough<HTMLDivElement> { … }
 * ```
 *
 * Writing the index signature inline instead is rejected by
 * `passthrough/no-anonymous-passthrough`: an unnamed passthrough is invisible
 * to the rule that keeps the promise, which is the only reason this marker
 * exists as a type rather than a paragraph.
 */
export interface Passthrough<E extends HTMLElement = HTMLElement> {
  /**
   * The node the passthrough lands on — this primitive's ONE exposed element,
   * for measurement, drag sources and scroll-into-view.
   *
   * It is never automatically the node you *focus*. A primitive that
   * synthesizes its focusable control (see `Row`) decides which element that
   * is and may move it between render paths, so it publishes the capability to
   * focus it rather than the node itself. `ref` stays the node the caller
   * addressed.
   */
  ref?: React.Ref<E>;
  [key: string]: unknown;
}
