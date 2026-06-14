import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { HookSuccessView } from "./components/hook-success-view";

export default {
  collapsed: true,
  description:
    "Renders hook_success attachment events: the execution record of a hook command (which hook, exit code, duration), surfacing stderr/non-zero exits.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "hook_success",
      component: HookSuccessView,
    }),
  ],
} satisfies PluginDefinition;
