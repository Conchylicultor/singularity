import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { ContainerNoRow } from "@plugins/page/plugins/container/web";
import { instructionsBlock } from "../core";
import { InstructionsAnchor } from "./components/instructions-anchor";
import { InstructionsFrame } from "./components/instructions-frame";
import { InstructionsMenu } from "./components/instructions-menu";

export default {
  description:
    "Instructions block type: a void CONTAINER whose soft-tinted box wraps blocks of any type, holding the human's standing instructions to agents working under the page it sits on — delivered to them with their reads, and to every conversation at its start when the card's Global switch is on.",
  contributions: [
    // The handle's home (see `human-notes`): an anchor renders no row, so the
    // shared null renderer is unreachable, and the registration is what the
    // palette, markdown, paste and the turn-into list read.
    Editor.Block({
      id: instructionsBlock.type,
      match: instructionsBlock.type,
      block: instructionsBlock,
      component: ContainerNoRow,
    }),
    // Contributing the frame is what makes this a container; the corner name
    // and the Global switch ride on the same registration.
    Editor.BlockFrame({
      match: instructionsBlock.type,
      component: InstructionsFrame,
      cornerAnchor: InstructionsAnchor,
      pad: "box",
      menu: InstructionsMenu,
    }),
  ],
} satisfies PluginDefinition;
