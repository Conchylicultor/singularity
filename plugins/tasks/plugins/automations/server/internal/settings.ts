import { getConfig } from "@plugins/config_v2/server";
import {
  cadenceCron,
  readAutomationSettings,
  type AutomationSettings,
  type AutomationSource,
  type TriggerKind,
} from "../../core";
import type { AutomationSpec } from "./registry";

/** The common settings an automation runs with now: its config document. */
export function automationSettings(spec: AutomationSpec): AutomationSettings {
  return readAutomationSettings(getConfig(spec.config));
}

/** The sources that take part: every declared one the settings do not exclude. */
export function includedSources(
  sources: readonly AutomationSource[],
  settings: AutomationSettings,
): AutomationSource[] {
  const excluded = new Set(settings.excludedSources);
  return sources.filter((s) => !excluded.has(s.id));
}

/**
 * The UTC crontab to install for an automation now — `null` while it is off,
 * woken by its event, or its schedule is invalid (`error` says why). The one
 * reading the job's schedule resolver and the catalog share, so the pane can
 * never show a schedule the scheduler does not run.
 */
export function automationCron(spec: AutomationSpec): {
  cron: string | null;
  error: string | null;
} {
  const settings = automationSettings(spec);
  const supported: readonly TriggerKind[] = spec.triggers.kinds;
  if (!supported.includes(settings.trigger)) {
    return {
      cron: null,
      error: `its config says trigger "${settings.trigger}", which it does not support (${spec.triggers.kinds.join(", ")})`,
    };
  }
  if (!settings.enabled || settings.trigger !== "schedule") {
    return { cron: null, error: null };
  }
  const resolved = cadenceCron(
    settings.schedule,
    -new Date().getTimezoneOffset(),
  );
  return resolved.ok
    ? { cron: resolved.cron, error: null }
    : { cron: null, error: resolved.error };
}
