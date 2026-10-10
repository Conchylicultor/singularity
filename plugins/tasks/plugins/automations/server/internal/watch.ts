import { watchConfig } from "@plugins/config_v2/server";
import { refreshJobSchedules } from "@plugins/infra/plugins/jobs/server";
import { automationsCatalogServed } from "./live";
import { registeredAutomations } from "./registry";

/**
 * For the life of the process: when an automation's config changes, re-install
 * the job schedules (its cron is resolved from that config) and re-push the
 * catalog; a launch-kind automation is also woken — turned on (or given more
 * slots), it starts at once rather than at its next event. Run once every
 * plugin is ready — `watchConfig` needs the config registered and loaded.
 *
 * Boot wakes every launch-kind automation once too: what settled while the
 * backend was down announced nothing, and a free slot would otherwise wait for
 * the next event.
 */
export function watchAutomationConfigs(): void {
  for (const { spec, wake } of registeredAutomations()) {
    watchConfig(spec.config, () => {
      refreshJobSchedules();
      automationsCatalogServed.notify();
      if (spec.kind === "launch") wake();
    });
    if (spec.kind === "launch") wake();
  }
}
