import { z } from "zod";
import { resourceDescriptor, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useConfigValues } from "@plugins/config/web";
import { cn } from "@/lib/utils";
import { commitsConfig } from "../../shared/config";

type PathStateMap = Record<string, boolean>;

export const excludedPathStateResource = resourceDescriptor<PathStateMap>(
  "stats-commits.excluded-path-state",
  z.record(z.boolean()),
);

async function setPathEnabled(path: string, enabled: boolean): Promise<void> {
  const res = await fetch("/api/stats/commits/excluded-path-state", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, enabled }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH excluded-path-state failed: ${res.status} ${text}`);
  }
}

export interface ExcludedPathTogglesProps {
  /** If true, render pills right-aligned in a flat row (for chart header use). */
  dense?: boolean;
}

export function ExcludedPathToggles({ dense = false }: ExcludedPathTogglesProps) {
  const { excludedPaths } = useConfigValues(commitsConfig, "stats-commits");
  const { data: overrides } = useResource(excludedPathStateResource);

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
      {excludedPaths.map((path) => {
        const enabled = overrides?.[path] ?? true;
        return (
          <button
            key={path}
            type="button"
            onClick={() => void setPathEnabled(path, !enabled)}
            title={
              enabled
                ? `Excluding ${path} — click to include`
                : `Including ${path} — click to exclude`
            }
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              enabled
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground line-through",
            )}
          >
            {path}
          </button>
        );
      })}
    </div>
  );
}
