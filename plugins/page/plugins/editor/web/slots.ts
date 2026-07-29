import { useMemo, type ComponentType } from "react";
import {
  defineDispatchSlot,
  defineOrderedDispatchSlot,
  defineRenderSlot,
  type OrderedDispatchContribution,
} from "@plugins/primitives/plugins/slot-render/web";
import type { Block, BlockHandle } from "../core";
import type {
  BlockAnchorProps,
  BlockEditorAPI,
  BlockFrameProps,
  BlockRendererProps,
} from "./types";
import { UnknownBlock } from "./components/unknown-block";

/** Block handle metadata carried alongside the dispatch fields (match, component). */
export interface BlockMeta {
  block: BlockHandle<unknown>;
}

/** Full contribution shape — block metadata plus ordered-dispatch fields. */
export type BlockContribution =
  OrderedDispatchContribution<BlockRendererProps, string> & BlockMeta;

/**
 * Extra fields carried alongside a container frame's dispatch fields.
 *
 * `anchor` is the container's leading decoration (the callout's icon), rendered
 * by the surface in the ROW layer — see `BlockAnchorProps`. It rides on the
 * frame registration rather than getting a slot of its own on purpose:
 * containerhood is already derived from *who actually paints a box*
 * (`useFramedBlockTypes`), precisely so it cannot drift from a second flag; a
 * separate anchor slot would reintroduce exactly that drift in a new coat — a
 * type could claim a decoration while framing nothing, or frame without one.
 *
 * The honest cost: only a field literally named `component` goes through the
 * framework's sealed-component middleware chain (error boundary, reorder), so an
 * `anchor` component is UNSEALED — a crash inside it is not contained to the
 * slot. Precedent: `BlockHandle.icon` is rendered raw today. Documented, not
 * discovered.
 */
export interface BlockFrameMeta {
  anchor?: ComponentType<BlockAnchorProps>;
}

export const Editor = {
  // Ordered-dispatch: renders one contribution per block via `.Dispatch`, but
  // each contribution carries an `id` so the slot enters the reorderable-slots
  // manifest and owes an authored config override. The grouped block menus read
  // that config order (groups + labels) through `useReorderedEntries`; the slot
  // itself stays pure single-match dispatch.
  Block: defineOrderedDispatchSlot<BlockRendererProps, string, BlockMeta>(
    "page.editor.block",
    {
      key: (props) => props.block.type,
      fallback: UnknownBlock,
      docLabel: (c) => c.block?.type,
    },
  ),
  /**
   * A block type's CONTAINER FRAME: the decorated box painted around the
   * container's own row PLUS its whole visible subtree (the callout's tint).
   * Contributing here is what makes a block type a container — the surfaces
   * derive the framed-type set from this slot's registered matches
   * (`useFramedBlockTypes`), so there is no second "I am a container" flag to
   * drift from it.
   *
   * Deliberately NOT a fallback dispatch: a type with no contribution is not
   * framed at all and its subtree stays flat, so `.Dispatch` is only ever
   * rendered for a type known to match. `match` must be a plain string (the
   * block type) — the membership set is read off it, so a RegExp or predicate
   * contribution would paint but never be grouped.
   */
  BlockFrame: defineDispatchSlot<BlockFrameProps, string, BlockFrameMeta>(
    "page.editor.block-frame",
    {
      key: (props) => props.type,
      docLabel: (c) => (typeof c.match === "string" ? c.match : undefined),
    },
  ),
  /**
   * Extra "Turn into" targets in the block-actions menu, contributed by plugins
   * that span more than the editor can know (e.g. turn-into-page, which creates
   * a page + a page-link). Rendered inside the menu's "Turn into" section. The
   * contribution receives the block, its editor API, and a `close` callback.
   */
  TurnInto: defineRenderSlot<{
    component: ComponentType<{ block: Block; api: BlockEditorAPI; close: () => void }>;
  }>("page.editor.turn-into"),
  /**
   * Toolbar controls for the floating selection format bar. Each contribution
   * renders one control (typically a `<MarkButton/>` reading `useFormatToolbar()`
   * for live active state). The bar is rendered by `FormatToolbarPlugin` only when
   * a non-collapsed range selection exists; contributions never see the editor
   * directly — they dispatch Lexical commands through the context. Reorder
   * middleware applies automatically (the bar is reorderable, by design).
   */
  FormatAction: defineRenderSlot<{ component: ComponentType }>(
    "page.editor.format-action",
  ),
};

/**
 * The set of block types that are container frames, derived from the
 * `Editor.BlockFrame` registrations themselves. A surface asks "should I group
 * this block's subtree under it?" and gets an answer that cannot disagree with
 * who actually paints a frame — adding or removing a container plugin updates
 * every surface with zero code changes.
 */
export function useFramedBlockTypes(): ReadonlySet<string> {
  const contributions = Editor.BlockFrame.useContributions();
  return useMemo(
    () =>
      new Set(
        contributions
          .map((c) => c.match)
          .filter((m): m is string => typeof m === "string"),
      ),
    [contributions],
  );
}

/**
 * Block type → its container ANCHOR component, derived from the same
 * `Editor.BlockFrame` registrations `useFramedBlockTypes()` reads. Twin of that
 * hook, on the same single source of truth: a type has a decoration exactly when
 * the registration that makes it a container also supplies one.
 *
 * A `BlockHandle` declaring `anchor: true` whose plugin supplies no component
 * here is a real disagreement (the reducer would treat the type as a void
 * container while the surface paints nothing) — `./singularity check
 * page-editor:anchor-has-decoration` fails on it.
 */
export function useBlockAnchors(): ReadonlyMap<string, ComponentType<BlockAnchorProps>> {
  const contributions = Editor.BlockFrame.useContributions();
  return useMemo(() => {
    const out = new Map<string, ComponentType<BlockAnchorProps>>();
    for (const c of contributions) {
      if (typeof c.match === "string" && c.anchor) out.set(c.match, c.anchor);
    }
    return out;
  }, [contributions]);
}
