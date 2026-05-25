import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { BlockHandle } from "../core";
import type { BlockRendererProps } from "./types";

export interface BlockContribution {
  block: BlockHandle<unknown>;
  component: ComponentType<BlockRendererProps>;
}

export const Editor = {
  Block: defineSlot<BlockContribution>(
    "page.editor.block",
    { docLabel: (p) => p.block.type },
  ),
};
