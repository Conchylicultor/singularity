import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { ConfigDescriptor } from "../../core";

export const ConfigV2 = {
  // `pluginId` is the optional DOT-form plugin-id override (mirrors the server
  // ConfigV2.Register contribution); the store path is derived via asPath(id).
  WebRegister: defineSlot<{ descriptor: ConfigDescriptor; pluginId?: PluginId }>(
    "config-v2.web-register",
  ),
};
