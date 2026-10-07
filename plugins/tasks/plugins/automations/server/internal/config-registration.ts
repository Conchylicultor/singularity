import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import {
  AUTOMATIONS_CONFIG_PLUGIN_ID,
  type AutomationConfigFields,
} from "../../core";

/**
 * The server registration of an automation's config document, stored under
 * `tasks/automations` (so its committed default is
 * `config/tasks/automations/<id>.origin.jsonc`). List it in the declaring
 * plugin's server `contributions`; its web twin is the automations web
 * barrel's `automationConfigContributions`.
 */
export function automationConfigRegistration<F extends AutomationConfigFields>(
  descriptor: ConfigDescriptor<F>,
) {
  return ConfigV2.Register({
    descriptor,
    pluginId: AUTOMATIONS_CONFIG_PLUGIN_ID,
  });
}
