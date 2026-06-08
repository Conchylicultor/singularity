import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { ConfigDescriptor } from "../../core";

interface ConfigRegistration {
  descriptor: ConfigDescriptor;
  /**
   * Optional override for the plugin id the config store path is derived from.
   * When set, the config file lands under `config/<pluginId>/` instead of under
   * the registering plugin's own loader-injected `_pluginId`. Lets a plugin
   * register descriptors that belong to a *different* defining plugin.
   */
  pluginId?: string;
}

export const ConfigV2 = {
  Register: defineServerContribution<ConfigRegistration>("ConfigV2.Register"),
};
