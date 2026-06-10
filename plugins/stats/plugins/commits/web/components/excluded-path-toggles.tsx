import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { cn } from "@/lib/utils";
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
      <Text as="p" variant="caption" className="text-muted-foreground">
        No paths configured. Add entries to <code>excludedPaths</code> in Settings.
      </Text>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5",
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
    </div>
  );
}
