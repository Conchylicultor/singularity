import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { automationConfigContributions } from "@plugins/tasks/plugins/automations/web";
import { depsUpgradesConfig } from "../shared/config";

export default {
  description:
    "Registers the Dependency upgrades automation's config (schedule, push policy, model, prompt template) for the Automations pane and Settings → Config.",
  contributions: [...automationConfigContributions(depsUpgradesConfig)],
} satisfies PluginDefinition;
