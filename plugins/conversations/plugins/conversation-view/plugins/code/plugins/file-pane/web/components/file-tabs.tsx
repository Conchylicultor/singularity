import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
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
          <ToggleChip
            key={c.id}
            role="tab"
            aria-selected={isActive}
            active={isActive}
            variant="ghost"
            size="sm"
            onClick={() => setActiveId(c.id)}
            className={isActive ? "bg-muted text-foreground hover:bg-muted" : undefined}
          >
            {c.label}
          </ToggleChip>
        );
      })}
    </div>
  );
}
