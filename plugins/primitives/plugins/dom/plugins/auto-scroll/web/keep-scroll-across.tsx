import { Component, type ReactNode, type RefObject } from "react";
import { findScrollParent } from "./internal/find-scroll-parent";

export interface KeepScrollAcrossProps {
  /**
   * Changes exactly when the region swaps its DOM wholesale (e.g. a list
   * switching between a plain and a windowed render). Only a change of this
   * key snapshots and restores — every other update costs nothing.
   */
  swapKey: unknown;
  /** An element that survives the swap; its scroll parent is the one kept. */
  anchorRef: RefObject<Element | null>;
  children: ReactNode;
}

/**
 * Keeps the enclosing scroller where it is across a commit that replaces a
 * region's content wholesale.
 *
 * Such a commit removes every child before it inserts the replacement, and the
 * browser loses the offset in between: anything that forces a layout mid-commit
 * (a blur handler of a removed focused node, scroll anchoring re-selecting from
 * a vanished anchor) sees short content and clamps — so the list jumps to the
 * top though its full height is back before paint. No hook runs before React's
 * mutations, so this is a class: `getSnapshotBeforeUpdate` reads the offset
 * while the old content is still in place, `componentDidUpdate` writes it back
 * before paint (and before a child's state-driven follow-up render, so a
 * virtualizer attaching then reads the restored offset).
 */
export class KeepScrollAcross extends Component<
  KeepScrollAcrossProps,
  object,
  { scroller: HTMLElement; top: number } | null
> {
  override getSnapshotBeforeUpdate(
    prev: Readonly<KeepScrollAcrossProps>,
  ): { scroller: HTMLElement; top: number } | null {
    if (Object.is(prev.swapKey, this.props.swapKey)) return null;
    const anchor = this.props.anchorRef.current;
    if (!(anchor instanceof HTMLElement)) return null;
    const scroller = findScrollParent(anchor);
    return { scroller, top: scroller.scrollTop };
  }

  override componentDidUpdate(
    _prev: Readonly<KeepScrollAcrossProps>,
    _state: Readonly<object>,
    snapshot: { scroller: HTMLElement; top: number } | null,
  ): void {
    if (snapshot === null) return;
    if (snapshot.scroller.scrollTop !== snapshot.top) {
      snapshot.scroller.scrollTop = snapshot.top;
    }
  }

  override render(): ReactNode {
    return this.props.children;
  }
}
