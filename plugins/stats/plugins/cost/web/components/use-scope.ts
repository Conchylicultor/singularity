import { setConfigValue, useConfigValues } from "@plugins/config/web";
import { costConfig } from "@plugins/stats/plugins/cost/shared/config";

export type Scope = "all" | "singularity";

export function useScope(): {
  scope: Scope;
  singularityOnly: boolean;
  toggle: () => void;
} {
  const { singularityOnly } = useConfigValues(costConfig, "stats-cost");
  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    scope: singularityOnly ? "singularity" : "all",
    singularityOnly,
    toggle: () =>
      void setConfigValue("stats-cost.singularityOnly", !singularityOnly),
  };
}

export function withScope(url: string, scope: Scope): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}scope=${scope}`;
}
