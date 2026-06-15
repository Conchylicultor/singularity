import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { audioBlock } from "../core";
import { AudioBlock } from "./components/audio-block";

export { audioBlock, AUDIO_TYPE } from "../core";

export default {
  description: "Audio block type: upload an audio file and play it inline.",
  contributions: [
    Editor.Block({ match: audioBlock.type, block: audioBlock, component: AudioBlock }),
  ],
} satisfies PluginDefinition;
