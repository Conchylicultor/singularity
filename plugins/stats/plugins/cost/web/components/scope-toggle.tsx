import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { useScope } from "./use-scope";

export function ScopeToggle() {
  const { singularityOnly, toggle } = useScope();
  return (
    <ToggleChip
      active={singularityOnly}
      onClick={toggle}
      title={
        singularityOnly
          ? "Singularity sessions only — click to include all Claude Code sessions on this machine"
          : "Including all Claude Code sessions — click to filter to Singularity only"
      }
    >
      Singularity only
    </ToggleChip>
  );
}
