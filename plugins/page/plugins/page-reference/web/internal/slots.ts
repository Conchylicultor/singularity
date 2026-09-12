import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { PageData } from "@plugins/page/plugins/editor/core";
import type { PageNavigation } from "./navigation";

/** What every page-reference action operates on: the page being referenced. */
export interface PageReferenceActionProps {
  /** The id of the page the reference points at. */
  pageId: string;
}

/** What a decoration's chip is handed: the page being referenced. */
export interface PageReferenceChipProps {
  /** The id of the page the reference points at. */
  pageId: string;
}

/**
 * A kind of page that a reference paints differently, declared by the plugin
 * that owns the kind — so a reference renderer asks "is this page special?"
 * without knowing any of the answers.
 */
export interface PageReferenceDecorationContribution {
  /**
   * Whether this decoration is the one for `page`. A pure function of the page
   * row's own `data`: the kind of a page is written on the page, so every
   * surface holding the row (a sub-page line, a sidebar tree of hundreds) can
   * answer it without a read of its own.
   */
  applies: (page: PageData) => boolean;
  /**
   * Classes painting the reference's whole row — a background wash. Semantic
   * tokens only. A wash that a hover-revealed action cluster may be pinned over
   * co-publishes itself as `--scrim` (see `row-actions`), the way `Row`'s own
   * tints do.
   */
  tint: string;
  /**
   * An always-visible chip at the row's trailing edge (who made this page, …),
   * on the surfaces that have room for one. Named `component` so the framework
   * seals it and every render goes through the error-boundary middleware: a
   * crash in one chip stays in that chip instead of taking the row down.
   */
  component?: ComponentType<PageReferenceChipProps>;
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
  /**
   * How a reference paints a page of a particular KIND — a tint over its row
   * and, where the row has room, a chip at its trailing edge. The kind is read
   * off the page's own `data`, so the renderers (the sub-page row, the Pages
   * sidebar) name no kind at all: a new kind is one plugin folder.
   *
   * A plain slot, not a render slot: nothing here is a list the user orders —
   * each reference picks at most ONE decoration (the first whose `applies`
   * answers yes, in registration order, the tie-break `Dispatch` uses) and
   * paints it in its own places. Read it through `usePageReferenceDecoration`
   * or `usePageReferenceTint`, never by walking the contributions.
   */
  Decoration: defineSlot<PageReferenceDecorationContribution>(),
};
