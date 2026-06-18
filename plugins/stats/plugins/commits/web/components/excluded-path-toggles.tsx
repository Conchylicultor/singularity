import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { ConfigGearButton } from "@plugins/config_v2/plugins/config-link/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { commitsConfig } from "../../shared/config";

export interface ExcludedPathTogglesProps {
  /** If true, render pills right-aligned in a flat row (for chart header use). */
  dense?: boolean;
}

export function ExcludedPathToggles({ dense = false }: ExcludedPathTogglesProps) {
  const { excludedPaths } = useConfig(commitsConfig);
  const setConfig = useSetConfig(commitsConfig);

  if (excludedPaths.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-xs">
        <Text as="p" variant="caption" className="text-muted-foreground">
          No paths configured.
        </Text>
        <ConfigGearButton descriptor={commitsConfig} label="Configure excluded paths" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-xs",
        dense ? "justify-end" : "justify-start",
      )}
    >
      {excludedPaths.map((item, index) => {
        return (
          <ToggleChip
            key={item.path}
            active={item.enabled}
            onClick={() => {
              const updated = excludedPaths.map((p, i) =>
                i === index ? { ...p, enabled: !p.enabled } : p,
              );
              setConfig("excludedPaths", updated);
            }}
            title={
              item.enabled
                ? `Excluding ${item.path} — click to include`
                : `Including ${item.path} — click to exclude`
            }
            className={cn(!item.enabled && "line-through")}
          >
            {item.path}
          </ToggleChip>
        );
      })}
      <ConfigGearButton descriptor={commitsConfig} label="Configure excluded paths" />
    </div>
  );
}
