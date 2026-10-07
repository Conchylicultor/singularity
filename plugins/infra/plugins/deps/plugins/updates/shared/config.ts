import { defineAutomationConfig } from "@plugins/tasks/plugins/automations/core";
import { DEPS_UPGRADE_PROMPT } from "../core";

/**
 * The Dependency upgrades automation's config: on, weekly on Monday at 06:00
 * local, pushing once checks pass, with the upgrade prompt as its template.
 * Stored as `config/tasks/automations/deps-upgrades.origin.jsonc`.
 */
export const depsUpgradesConfig = defineAutomationConfig("deps-upgrades", {
  enabled: true,
  push: "checks",
  trigger: "schedule",
  cadence: "week",
  weekday: "mon",
  at: "06:00",
  prompt: DEPS_UPGRADE_PROMPT,
});
