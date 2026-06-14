import type { ComponentType } from "react";
import {
  defineDispatchSlot,
  defineRenderSlot,
  type DispatchContribution,
} from "@plugins/primitives/plugins/slot-render/web";
import type { Block, BlockHandle } from "../core";
import type { BlockEditorAPI, BlockRendererProps } from "./types";
import { UnknownBlock } from "./components/unknown-block";

/** Block handle metadata carried alongside the dispatch fields (match, component). */
export interface BlockMeta {
  block: BlockHandle<unknown>;
}

/** Full contribution shape — block metadata plus dispatch fields. */
export type BlockContribution =
  DispatchContribution<BlockRendererProps, string> & BlockMeta;

export const Editor = {
  Block: defineDispatchSlot<BlockRendererProps, string, BlockMeta>(
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
};
