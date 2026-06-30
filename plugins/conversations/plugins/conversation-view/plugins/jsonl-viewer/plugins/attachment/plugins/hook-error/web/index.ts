import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewerAttachment } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/web";
import { HookErrorView } from "./components/hook-error-view";

export default {
  collapsed: true,
  description:
    "Renders hook-failure attachment events (hook_non_blocking_error, hook_blocking_error, hook_cancelled) as a destructive, expanded-by-default error card surfacing the failing command, exit code, and stderr.",
  contributions: [
    JsonlViewerAttachment.Renderer({
      match: "hook_non_blocking_error",
      component: HookErrorView,
    }),
    JsonlViewerAttachment.Renderer({
      match: "hook_blocking_error",
      component: HookErrorView,
    }),
    JsonlViewerAttachment.Renderer({
      match: "hook_cancelled",
      component: HookErrorView,
    }),
  ],
} satisfies PluginDefinition;
