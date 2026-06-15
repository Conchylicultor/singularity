import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { videoBlock } from "../core";
import { VideoBlock } from "./components/video-block";

export { videoBlock, VIDEO_TYPE } from "../core";

export default {
  description: "Video block type: upload a video file and play it inline.",
  contributions: [
    Editor.Block({ match: videoBlock.type, block: videoBlock, component: VideoBlock }),
  ],
} satisfies PluginDefinition;
