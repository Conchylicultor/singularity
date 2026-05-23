import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { costConfig } from "../../shared/config";

export type Scope = "all" | "singularity";

export function useScope(): {
  scope: Scope;
  singularityOnly: boolean;
  toggle: () => void;
} {
  const { singularityOnly } = useConfig(costConfig);
  const setConfig = useSetConfig(costConfig);
  return {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    scope: singularityOnly ? "singularity" : "all",
    singularityOnly,
    toggle: () => setConfig("singularityOnly", !singularityOnly),
  };
}

export function withScope(url: string, scope: Scope): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}scope=${scope}`;
}
