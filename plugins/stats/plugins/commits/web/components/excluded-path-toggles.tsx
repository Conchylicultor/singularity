import { useConfig, useSetConfig } from "@plugins/config_v2/web";
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
      <p className="text-xs text-muted-foreground">
        No paths configured. Add entries to <code>excludedPaths</code> in Settings.
      </p>
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
          <button
            key={item.path}
            type="button"
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
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              item.enabled
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground line-through",
            )}
          >
            {item.path}
          </button>
        );
      })}
    </div>
  );
}
