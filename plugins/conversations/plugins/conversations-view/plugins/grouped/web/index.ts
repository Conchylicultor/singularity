import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { IdKinds } from "@plugins/ids/web";
import { conversationGroupIdKind } from "../core";

export default {
  description:
    "Registers the conversation-group id kind (`cgrp-…`) in the browser's id registry, the twin of the server registration.",
  contributions: [IdKinds.Kind({ kind: conversationGroupIdKind })],
} satisfies PluginDefinition;
