import type { ComponentType } from "react";
import {
  defineOrderedDispatchSlot,
  defineRenderSlot,
  type OrderedDispatchContribution,
} from "@plugins/primitives/plugins/slot-render/web";
import type { Block, BlockHandle } from "../core";
import type { BlockEditorAPI, BlockRendererProps } from "./types";
import { UnknownBlock } from "./components/unknown-block";

/** Block handle metadata carried alongside the dispatch fields (match, component). */
export interface BlockMeta {
  block: BlockHandle<unknown>;
}

/** Full contribution shape — block metadata plus ordered-dispatch fields. */
export type BlockContribution =
  OrderedDispatchContribution<BlockRendererProps, string> & BlockMeta;

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
