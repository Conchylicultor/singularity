import { defineDispatchSlot, type DispatchContribution } from "@plugins/primitives/plugins/slot-render/web";
import type { BlockHandle } from "../core";
import type { BlockRendererProps } from "./types";
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
};
