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
    scope: singularityOnly ? "singularity" : "all",
    singularityOnly,
    toggle: () => setConfig("singularityOnly", !singularityOnly),
  };
}
