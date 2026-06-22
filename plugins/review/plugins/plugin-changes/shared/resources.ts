import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { PluginChangesSchema } from "../core/protocol";
import type { PluginChangesResponse } from "../core/protocol";

export const pluginChangesResource = resourceDescriptor<PluginChangesResponse, { conversationId: string }>(
  "review.plugin-changes",
  PluginChangesSchema,
  { plugins: [] },
);
