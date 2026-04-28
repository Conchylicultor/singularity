import { cn } from "@/lib/utils";
import type { FileRenderersHandle } from "./use-file-renderers";

export function FileTabs({
  resolved,
  active,
  setActiveId,
}: FileRenderersHandle) {
  if (resolved.length === 0) return null;
  return (
    <div role="tablist" className="flex items-center gap-1">
      {resolved.map(({ contribution: c }) => {
        const isActive = active?.contribution.id === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveId(c.id)}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
