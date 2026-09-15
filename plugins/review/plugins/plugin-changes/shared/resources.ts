import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { PluginChangesSchema, type PluginChangesResponse } from "../core";

export const pluginChangesResource = resourceDescriptor<
  PluginChangesResponse,
  { conversationId: string }
>("review.plugin-changes", PluginChangesSchema, { plugins: [] });
