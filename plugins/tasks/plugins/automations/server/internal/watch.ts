import { watchConfig } from "@plugins/config_v2/server";
import { refreshJobSchedules } from "@plugins/infra/plugins/jobs/server";
import { automationsCatalogServed } from "./live";
import { registeredAutomations } from "./registry";

/**
 * For the life of the process: when an automation's config changes, re-install
 * the job schedules (its cron is resolved from that config) and re-push the
 * catalog. Run once every plugin is ready — `watchConfig` needs the config
 * registered and loaded.
 */
export function watchAutomationConfigs(): void {
  for (const { spec } of registeredAutomations()) {
    watchConfig(spec.config, () => {
      refreshJobSchedules();
      automationsCatalogServed.notify();
    });
  }
}
