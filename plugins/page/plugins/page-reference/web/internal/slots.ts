import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { PageNavigation } from "./navigation";

/** What every page-reference action operates on: the page being referenced. */
export interface PageReferenceActionProps {
  /** The id of the page the reference points at. */
  pageId: string;
}

export const PageReference = {
  /**
   * Actions offered on a reference to another page, revealed when the row the
   * reference paints is hovered. One frontier for all the reference renderers
   * (sub-page row, link block, whatever comes next), so an action is one plugin
   * folder rather than a button hand-rolled into each of them.
   *
   * An action that cannot act here declares `available` and must NOT `return
   * null` from its body instead. The cluster around these actions is painted by
   * the host row BEFORE any of them renders — a pinned box with its own scrim,
   * which would then sit over the reference's title fading its last characters
   * out on hover, with nothing inside it. So emptiness is declared where the
   * host can still act on it, the way `detail-sections` declares it for a
   * section with nothing to show.
   */
  Actions: defineRenderSlot<{
    component: ComponentType<PageReferenceActionProps>;
    /**
     * Whether this action can act at all, given what the host declared it can
     * do (`undefined` = the host declared no navigation). Default: always.
     *
     * A pure function of the navigation rather than a `useAvailable` hook, and
     * that is the point: every action on this frontier is an alternative way of
     * OPENING the referenced page, so the capability set is the only thing its
     * applicability can turn on. Answering it purely also keeps the caller's
     * hooks where the rules of hooks want them — one `usePageNavigation()` at
     * the top of the reading hook, rather than one per contribution inside a
     * loop.
     */
    available?: (nav: PageNavigation | undefined) => boolean;
  }>(),
};
