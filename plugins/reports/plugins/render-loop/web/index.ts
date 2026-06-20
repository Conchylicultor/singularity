import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { RenderLoopController } from "./internal/render-loop-controller";

export default {
  description:
    "Render-loop detector: a single invisible global controller (mounted via Core.Root) that installs one MutationObserver and files a deduped render-loop report when a subtree is rebuilt/re-mutated at a sustained high rate while idle, visible, and doing no meaningful work (wasted DOM thrash).",
  contributions: [Core.Root({ component: RenderLoopController })],
} satisfies PluginDefinition;
